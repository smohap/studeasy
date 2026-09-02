--
-- messaging.sql — switches on the messaging tables.
--
-- Run AFTER supabase/platform.sql and supabase/multi-role.sql. Safe to re-run.
--
-- platform.sql created threads, thread_participants and messages with sound
-- read policies and an in_thread() helper, and then stopped. There is no
-- insert policy on threads or thread_participants and no grant for either, so
-- until now nobody could start a conversation — only read ones that did not
-- exist. Nothing bumped last_message_at, and nothing set last_read_at.
--
-- The decision worth stating: this platform has children on it, so there are
-- no open direct messages. A message is only allowed along a relationship that
-- already exists — a teacher and their student, a teacher and that student's
-- parent, or an administrator with anyone. Student to student is refused.
-- That rule lives in may_message() below, not in the interface, because the
-- interface is not a security boundary.
--

-- ---------------------------------------------------------------------------
-- Who is allowed to talk to whom
-- ---------------------------------------------------------------------------

/*
 * Does `teacher` teach `student`, through a course or a class?
 *
 * Cancelled enrolments and cancelled registrations do not count: someone who
 * pulled out of a class should not keep a private channel to the tutor.
 */
create or replace function studeasy.teaches(teacher uuid, student uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1
    from studeasy.enrolments e
    join studeasy.courses c on c.id = e.course_id
    where e.student_id = student
      and c.teacher_id = teacher
      and e.status <> 'cancelled'
  ) or exists (
    select 1
    from studeasy.class_registrations r
    join studeasy.class_sessions cs on cs.id = r.class_id
    where r.student_id = student
      and cs.teacher_id = teacher
      and r.status in ('confirmed', 'offered')
  );
$$;

/*
 * May the caller message `other`?
 *
 * Every arm is written in both directions on purpose, so that a teacher can
 * open a conversation with a parent and a parent can open one with a teacher,
 * while no arm ever creates a path between two students.
 */
create or replace function studeasy.may_message(other uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select case
    when auth.uid() is null or other is null or other = auth.uid() then false
    -- An administrator can reach anyone, and anyone can reach an administrator.
    when studeasy.is_admin() then true
    when exists (
      select 1 from studeasy.profile_roles pr
      where pr.profile_id = other and pr.role = 'admin' and pr.status = 'active'
    ) then true
    -- Teacher and student, either way round.
    when studeasy.teaches(auth.uid(), other) then true
    when studeasy.teaches(other, auth.uid()) then true
    -- Parent of a child the other person teaches, either way round.
    when exists (
      select 1 from studeasy.profiles ch
      where ch.parent_id = auth.uid() and studeasy.teaches(other, ch.id)
    ) then true
    when exists (
      select 1 from studeasy.profiles ch
      where ch.parent_id = other and studeasy.teaches(auth.uid(), ch.id)
    ) then true
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Keeping the thread list honest
-- ---------------------------------------------------------------------------

/*
 * threads has no update policy, on purpose — a participant should not be able
 * to rewrite a conversation's metadata. last_message_at still has to move, so
 * it moves here, on the insert that caused it.
 */
create or replace function studeasy.bump_thread()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  update studeasy.threads
  set last_message_at = new.sent_at
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_thread on studeasy.messages;
create trigger messages_bump_thread
  after insert on studeasy.messages
  for each row execute function studeasy.bump_thread();

-- ---------------------------------------------------------------------------
-- Starting a conversation
-- ---------------------------------------------------------------------------

/*
 * Opens a thread with `other` and posts the first message, returning the
 * thread id.
 *
 * SECURITY DEFINER because starting a conversation means writing a
 * participant row for somebody else, which no sane RLS policy would let a
 * user do directly. The permission check is may_message(), and it runs before
 * anything is written.
 *
 * An existing one-to-one thread between the same two people is reused rather
 * than duplicated — otherwise every reply-by-new-message builds an inbox of
 * single-message threads all saying the same thing.
 */
create or replace function studeasy.start_thread(
  other uuid,
  first_message text,
  subject text default null,
  course uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  found_thread uuid;
  org uuid;
begin
  if caller is null then
    raise exception 'You are not signed in.';
  end if;

  if not studeasy.may_message(other) then
    raise exception 'You can only message a teacher you work with, or a student you teach.';
  end if;

  if coalesce(btrim(first_message), '') = '' then
    raise exception 'Write a message first.';
  end if;

  -- An existing private thread between exactly these two people.
  select tp.thread_id into found_thread
  from studeasy.thread_participants tp
  where tp.profile_id = caller
    and exists (
      select 1 from studeasy.thread_participants tp2
      where tp2.thread_id = tp.thread_id and tp2.profile_id = other
    )
    and (
      select count(*) from studeasy.thread_participants tp3
      where tp3.thread_id = tp.thread_id
    ) = 2
  limit 1;

  if found_thread is null then
    select p.organization_id into org from studeasy.profiles p where p.id = caller;

    insert into studeasy.threads (organization_id, course_id, subject)
    values (org, course, nullif(btrim(coalesce(subject, '')), ''))
    returning id into found_thread;

    insert into studeasy.thread_participants (thread_id, profile_id)
    values (found_thread, caller), (found_thread, other)
    on conflict (thread_id, profile_id) do nothing;
  end if;

  insert into studeasy.messages (thread_id, sender_id, body)
  values (found_thread, caller, btrim(first_message));

  -- The sender has, by definition, read their own message.
  update studeasy.thread_participants
  set last_read_at = now()
  where thread_id = found_thread and profile_id = caller;

  return found_thread;
end;
$$;

/*
 * Marks everything in a thread as read for the caller.
 *
 * A definer function rather than an update policy because thread_participants
 * is granted select only: a participant may record that they read a thread,
 * and nothing else about the row.
 */
create or replace function studeasy.mark_thread_read(thread uuid)
returns void
language sql
security definer
set search_path = studeasy, public
as $$
  update studeasy.thread_participants
  set last_read_at = now()
  where thread_id = thread and profile_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Reading the inbox
-- ---------------------------------------------------------------------------

/*
 * The caller's threads, newest activity first, with the other person's name,
 * a preview and an unread count.
 *
 * One round trip rather than a query per thread. Output columns are prefixed
 * because an OUT parameter named `thread_id` or `subject` would shadow the
 * table columns of the same name inside the body — the same trap that made
 * `position` fail in classes-forum.sql.
 */
create or replace function studeasy.list_threads()
returns table (
  t_id uuid,
  t_subject text,
  t_last_at timestamptz,
  other_name text,
  preview text,
  unread_count integer
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select
    th.id,
    th.subject,
    th.last_message_at,
    coalesce(
      (select string_agg(p.full_name, ', ' order by p.full_name)
       from studeasy.thread_participants tp2
       join studeasy.profiles p on p.id = tp2.profile_id
       where tp2.thread_id = th.id and tp2.profile_id <> auth.uid()),
      'StudEasy'
    ),
    (select m.body from studeasy.messages m
      where m.thread_id = th.id order by m.sent_at desc limit 1),
    (select count(*)::integer from studeasy.messages m
      where m.thread_id = th.id
        and m.sender_id <> auth.uid()
        and (tp.last_read_at is null or m.sent_at > tp.last_read_at))
  from studeasy.thread_participants tp
  join studeasy.threads th on th.id = tp.thread_id
  where tp.profile_id = auth.uid()
  order by th.last_message_at desc;
$$;

/*
 * Everyone the caller is allowed to start a conversation with.
 *
 * Written as a filter over profiles using may_message() so this list and the
 * permission check can never disagree — if the rule changes, both change. At
 * this scale the scan is cheap; if it stops being cheap the fix is an index on
 * the relationship tables, not a second copy of the rule.
 */
create or replace function studeasy.list_messageable_people()
returns table (person_id uuid, person_name text, role_label text)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select p.id, coalesce(p.full_name, 'StudEasy member'), p.role
  from studeasy.profiles p
  where p.id <> auth.uid()
    and studeasy.may_message(p.id)
  order by coalesce(p.full_name, '');
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function studeasy.teaches(uuid, uuid) to authenticated;
grant execute on function studeasy.may_message(uuid) to authenticated;
grant execute on function studeasy.start_thread(uuid, text, text, uuid) to authenticated;
grant execute on function studeasy.mark_thread_read(uuid) to authenticated;
grant execute on function studeasy.list_threads() to authenticated;
grant execute on function studeasy.list_messageable_people() to authenticated;

-- messages already carries `grant select, insert`; threads and
-- thread_participants stay select-only, because every write to them goes
-- through start_thread() or mark_thread_read().
