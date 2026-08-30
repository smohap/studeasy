-- StudEasy — reclaiming expired seat offers, and assignments set against a class.
--
-- Run AFTER supabase/classes-forum.sql. Safe to re-run.
--
-- Two gaps left open by that migration:
--
--   1. A seat offered to someone who never paid kept counting against capacity
--      forever, so a class could sit "full" with nobody in it.
--   2. assignments grew a class_id column, but every policy on it still keyed
--      off course_id alone — a class assignment would have been invisible to
--      the students it was set for and ungradeable by the teacher who set it.

-- ---------------------------------------------------------------------------
-- Expired offers
-- ---------------------------------------------------------------------------

/*
 * Cancels seat offers nobody paid for, then re-fills from the waiting list.
 *
 * Pass a class to sweep just that one; pass nothing to sweep everything, which
 * is what the scheduled job does. Returns how many seats it freed.
 *
 * The classes are collected into an array before anything is updated: a
 * plpgsql FOR-over-query is lazy, and modifying the rows it is walking is a
 * good way to skip some of them.
 */
create or replace function studeasy.release_expired_offers(only_class uuid default null)
returns integer
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  classes uuid[];
  affected uuid;
  freed integer := 0;
  n integer;
begin
  select array_agg(distinct r.class_id) into classes
  from studeasy.class_registrations r
  where r.status = 'offered'
    and r.paid = false
    and r.offer_expires_at is not null
    and r.offer_expires_at < now()
    and (only_class is null or r.class_id = only_class);

  if classes is null then
    return 0;
  end if;

  foreach affected in array classes loop
    update studeasy.class_registrations
    set status = 'cancelled',
        waitlist_position = null,
        cancelled_at = now(),
        offer_expires_at = null,
        refund_cents = 0,
        refund_reason = 'The window to pay for this seat closed, so it went back into the pool.'
    where class_id = affected
      and status = 'offered'
      and paid = false
      and offer_expires_at < now();

    get diagnostics n = row_count;
    freed := freed + n;

    -- Hand the seat to whoever is next in line.
    perform studeasy.promote_waitlist(affected);
  end loop;

  return freed;
end;
$$;

/*
 * Same as before, with one addition: stale offers on this class are swept
 * before the seats are counted.
 *
 * Doing it here means a seat is reclaimed at the exact moment somebody wants
 * it, so the scheduled sweep is a convenience for the waiting list rather than
 * the only thing standing between a class and a phantom full house.
 *
 * The sweep runs before the caller's own registration is read, so if it
 * promotes the caller off the waiting list they are told that, rather than
 * being handed a second seat.
 */
create or replace function studeasy.register_for_class(class uuid)
returns table (
  outcome text,
  waitlist_position integer,
  amount_due_cents integer,
  access_code text
)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.class_sessions%rowtype;
  existing studeasy.class_registrations%rowtype;
  taken integer;
  queued integer;
  next_pos integer;
  new_status text;
  due integer;
begin
  if caller is null then
    raise exception 'Sign in to register for a class.';
  end if;

  -- Serialises everyone trying to register for this class.
  select * into c from studeasy.class_sessions where id = class for update;
  if not found then
    raise exception 'That class does not exist.';
  end if;
  if c.status not in ('published', 'in_progress') then
    raise exception 'That class is not open for registration.';
  end if;
  if c.starts_at < now() and c.status = 'published' then
    raise exception 'That class has already started.';
  end if;

  -- Give up the seats nobody paid for before deciding whether this class is
  -- full. Safe under the lock we already hold.
  perform studeasy.release_expired_offers(class);

  select * into existing from studeasy.class_registrations
  where class_id = class and student_id = caller;

  if found and existing.status <> 'cancelled' then
    return query select existing.status, existing.waitlist_position, 0,
      case when existing.status = 'confirmed' then c.access_code else null end;
    return;
  end if;

  select count(*) into taken from studeasy.class_registrations
  where class_id = class and status in ('confirmed', 'offered');

  select count(*) into queued from studeasy.class_registrations
  where class_id = class and status = 'waitlisted';

  if taken < c.capacity then
    -- A free class confirms outright; a paid one holds the seat until payment.
    if c.price_cents = 0 then
      new_status := 'confirmed';
      due := 0;
    else
      new_status := 'offered';
      due := c.price_cents;
    end if;
    next_pos := null;

  elsif queued < c.waitlist_cap then
    new_status := 'waitlisted';
    due := 0;
    -- Aliased because waitlist_position is also an output parameter of this
    -- function; unqualified, the reference would be ambiguous.
    select coalesce(max(r.waitlist_position), 0) + 1 into next_pos
    from studeasy.class_registrations r
    where r.class_id = class and r.status = 'waitlisted';

  else
    raise exception 'This class is full and the waiting list is closed. Please try again later.';
  end if;

  insert into studeasy.class_registrations
    (class_id, student_id, status, waitlist_position, offer_expires_at, paid, registered_at, cancelled_at)
  values (
    class, caller, new_status, next_pos,
    case when new_status = 'offered' then least(now() + interval '48 hours', c.starts_at) end,
    new_status = 'confirmed' and c.price_cents = 0,
    now(), null
  )
  on conflict (class_id, student_id) do update
    set status = excluded.status,
        waitlist_position = excluded.waitlist_position,
        offer_expires_at = excluded.offer_expires_at,
        paid = excluded.paid,
        registered_at = now(),
        cancelled_at = null,
        refund_cents = null,
        refund_reason = null;

  return query select
    new_status,
    next_pos,
    due,
    case when new_status = 'confirmed' then c.access_code else null end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assignments set against a class
-- ---------------------------------------------------------------------------

create index if not exists assignments_class_idx
  on studeasy.assignments (class_id, due_at);

/*
 * An assignment has to belong to something. course_id became nullable when
 * class_id arrived, and without this an assignment could be created with
 * neither — visible to nobody, gradeable by nobody, impossible to find again.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assignments_has_parent'
  ) then
    alter table studeasy.assignments
      add constraint assignments_has_parent
      check (course_id is not null or class_id is not null);
  end if;
end $$;

/* Whoever is entitled to mark this assignment: the course's teacher, or the
   class's. Pulled into a function because four callers need the same test. */
create or replace function studeasy.marks_assignment(assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.assignments a
    where a.id = assignment
      and (
        (a.course_id is not null and studeasy.owns_course(a.course_id))
        or (a.class_id is not null and studeasy.teaches_class(a.class_id))
      )
  );
$$;

/*
 * A student sees a published assignment if they are enrolled in its course or
 * hold a seat in its class.
 *
 * A seat is enough — deliberately not the full in_class_room() test. The code
 * and the in-progress gate control when *material* is released; work is often
 * set before the class runs, and a student who cannot see the task cannot
 * prepare for it.
 */
drop policy if exists assignments_select on studeasy.assignments;
create policy assignments_select on studeasy.assignments
  for select using (
    (
      status = 'published'
      and (
        (course_id is not null and studeasy.enrolled_in(course_id))
        or (class_id is not null and studeasy.holds_class_seat(class_id))
      )
    )
    or (course_id is not null and studeasy.owns_course(course_id))
    or (class_id is not null and studeasy.teaches_class(class_id))
    or studeasy.is_admin()
  );

drop policy if exists assignments_write on studeasy.assignments;
create policy assignments_write on studeasy.assignments
  for all using (
    (course_id is not null and studeasy.owns_course(course_id))
    or (class_id is not null and studeasy.teaches_class(class_id))
    or studeasy.is_admin()
  )
  with check (
    (course_id is not null and studeasy.owns_course(course_id))
    or (class_id is not null and studeasy.teaches_class(class_id))
    or studeasy.is_admin()
  );

drop policy if exists submissions_select on studeasy.submissions;
create policy submissions_select on studeasy.submissions
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or studeasy.marks_assignment(submissions.assignment_id)
    or studeasy.is_admin()
  );

drop policy if exists submissions_update on studeasy.submissions;
create policy submissions_update on studeasy.submissions
  for update using (
    -- a student may replace their own work only before it is graded
    (student_id = auth.uid() and graded_at is null)
    or studeasy.marks_assignment(submissions.assignment_id)
    or studeasy.is_admin()
  );

/* Same contract as before; the ownership test now covers class assignments. */
create or replace function studeasy.grade_submission(
  submission uuid,
  awarded integer,
  comment text,
  release boolean default true
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  s studeasy.submissions%rowtype;
  a studeasy.assignments%rowtype;
begin
  select * into s from studeasy.submissions where id = submission;
  if not found then raise exception 'No such submission.'; end if;

  select * into a from studeasy.assignments where id = s.assignment_id;
  if not studeasy.marks_assignment(a.id) and not studeasy.is_admin() then
    raise exception 'Only the teacher who set this assignment can grade it.';
  end if;
  if awarded < 0 or awarded > a.max_marks then
    raise exception 'Mark must be between 0 and %.', a.max_marks;
  end if;

  update studeasy.submissions
  set marks = awarded,
      feedback = comment,
      graded_by = auth.uid(),
      graded_at = now(),
      released = release
  where id = submission;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function studeasy.marks_assignment(uuid) to authenticated;

-- Sweeping every class at once is the scheduled job's business; a signed-in
-- user only ever triggers the single-class sweep inside register_for_class().
revoke all on function studeasy.release_expired_offers(uuid) from anon, authenticated;
