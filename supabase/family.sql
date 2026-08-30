-- StudEasy — a parent's children: adding, and removing.
--
-- Run AFTER supabase/multi-role.sql. Safe to re-run.
--
-- Three gaps in the original linking code:
--
--   1. It tested profiles.role = 'parent'. Now that one account can hold
--      several roles that is the wrong question — a parent who also teaches,
--      sitting in their tutor portal, would have been refused.
--   2. Nothing stopped someone linking themselves. A person holding both the
--      student and parent roles could have become their own guardian, and with
--      it their own approver.
--   3. There was no way to undo a link. A child could be added and never
--      removed, which is the wrong default for anybody's data, let alone a
--      minor's.

/*
 * A parent asks to follow a student.
 *
 * Returns the resulting state and nothing identifying: echoing the student's
 * name back would turn this into a way of testing codes to see whose they are.
 */
create or replace function studeasy.request_student_link(code text)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  student studeasy.profiles%rowtype;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;

  -- has_role, not profiles.role: holding the parent role is the question, not
  -- which portal they happen to be looking at.
  if not studeasy.has_role('parent') then
    raise exception 'Only a parent account can add a child.';
  end if;

  select * into student
  from studeasy.profiles
  where student_code = upper(trim(code)) and role = 'student';

  if not found then
    -- Also the answer when the code belongs to somebody who has not finished
    -- registering as a student. They have to exist first.
    raise exception 'We could not find a student with that ID. Check it with your child.';
  end if;

  /*
   * You cannot be your own child. Somebody holding both roles would otherwise
   * become their own guardian — and, since the student approves the link, their
   * own approver.
   */
  if student.id = caller then
    raise exception 'That is your own Student ID. You cannot add yourself as a child.';
  end if;

  if student.parent_id = caller then
    return 'already_linked';
  end if;

  if exists (
    select 1 from studeasy.link_requests
    where parent_id = caller and student_id = student.id and status = 'pending'
  ) then
    return 'already_requested';
  end if;

  insert into studeasy.link_requests (parent_id, student_id)
  values (caller, student.id);

  insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, student.id, 'link_request',
         'Someone asked to follow your progress',
         'Approve it from your portal if you know who it is.',
         '/portal/student'
  from studeasy.profiles p where p.id = student.id;

  return 'requested';
end;
$$;

/*
 * Removes the link between a parent and a child.
 *
 * Either side may do it. The parent is the one the brief asks for, but a
 * student who wants to stop being followed should never have to ask the person
 * following them for permission.
 *
 * Any pending request between the two is withdrawn at the same time; otherwise
 * removing a child would leave a request sitting there ready to re-link them.
 */
create or replace function studeasy.unlink_student(student uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  current_parent uuid;
  notify_who uuid;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;

  select p.parent_id into current_parent
  from studeasy.profiles p where p.id = student;

  if current_parent is null then
    raise exception 'That student is not linked to anyone.';
  end if;
  if caller <> current_parent and caller <> student and not studeasy.is_admin() then
    raise exception 'Only the parent or the student can remove this link.';
  end if;

  -- Tells guard_profile() this parent_id write is legitimate. Transaction-local.
  perform set_config('studeasy.link_approved', 'on', true);

  update studeasy.profiles
  set parent_id = null, updated_at = now()
  where id = student;

  delete from studeasy.link_requests
  where parent_id = current_parent and student_id = student and status = 'pending';

  -- Tell the other party, whichever of the two that is.
  notify_who := case when caller = student then current_parent else student end;

  insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, notify_who, 'link_removed',
         'A family link was removed',
         case when caller = student
           then 'The student ended the link to your account.'
           else 'Your parent link was removed.'
         end,
         '/portal'
  from studeasy.profiles p where p.id = notify_who;
end;
$$;

grant execute on function studeasy.unlink_student(uuid) to authenticated;
