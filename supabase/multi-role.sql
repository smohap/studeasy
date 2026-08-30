-- StudEasy — one account, several roles.
--
-- Run AFTER supabase/classes-followup.sql. Safe to re-run.
--
-- The same person is often a parent and a tutor, and a tutor is sometimes also
-- a student. One role per account forced them into two logins.
--
-- The model:
--
--   profile_roles   every role a person holds, each with its own status. This
--                   is the source of truth for what someone may do.
--   profiles.role   which portal they are currently in. Navigation only — it is
--                   no longer a permission, and switching it grants nothing.
--   profiles.status the status of that active role, mirrored down from
--                   profile_roles so the places that already read it keep
--                   working unchanged.
--
-- `admin` stays allowlist-only. An administrator can hand out student, parent
-- and tutor, but cannot mint another administrator — otherwise one compromised
-- admin session is the whole system.

-- ---------------------------------------------------------------------------
-- The roles a person holds
-- ---------------------------------------------------------------------------

create table if not exists studeasy.profile_roles (
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  role studeasy.user_role not null,
  -- 'pending' means claimed but not yet approved. Only tutor ever starts there.
  status studeasy.account_status not null default 'active',
  granted_at timestamptz not null default now(),
  granted_by uuid references studeasy.profiles (id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references studeasy.profiles (id) on delete set null,
  primary key (profile_id, role)
);

create index if not exists profile_roles_role_idx
  on studeasy.profile_roles (role, status);

-- Everyone who already had a role keeps it, with the status they had.
insert into studeasy.profile_roles (profile_id, role, status, approved_at, approved_by)
select p.id, p.role, p.status, p.approved_at, p.approved_by
from studeasy.profiles p
where p.role is not null
on conflict (profile_id, role) do nothing;

-- ---------------------------------------------------------------------------
-- Reading roles
-- ---------------------------------------------------------------------------

/*
 * Does the caller hold this role, approved?
 *
 * Every permission check should go through here rather than comparing against
 * profiles.role, which now only says which portal they happen to be looking at.
 */
create or replace function studeasy.has_role(wanted studeasy.user_role)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.profile_roles
    where profile_id = auth.uid() and role = wanted and status = 'active'
  );
$$;

/* Same contract as before — it just reads the new table. */
create or replace function studeasy.is_admin()
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.profile_roles
    where profile_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Keeping profiles.role in step
-- ---------------------------------------------------------------------------

/*
 * Mirrors the active role into profile_roles.
 *
 * Registration writes profiles.role directly and always has; rather than
 * rewrite those paths, this makes the new table follow along. A first-time
 * tutor therefore arrives here already marked 'pending' by guard_profile().
 */
create or replace function studeasy.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if new.role is not null then
    insert into studeasy.profile_roles (profile_id, role, status)
    values (new.id, new.role, new.status)
    on conflict (profile_id, role) do update
      set status = excluded.status;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_sync_role on studeasy.profiles;
create trigger profiles_sync_role
  after insert or update of role, status on studeasy.profiles
  for each row execute function studeasy.sync_profile_role();

/*
 * Same guard as before, with one thing now allowed: moving profiles.role
 * between roles the person actually holds.
 *
 * That is a navigation preference, not a promotion — the check confirms the
 * target role exists for them and is approved, so switching cannot grant
 * anything. Claiming a role they do not hold still goes through request_role().
 */
create or replace function studeasy.guard_profile()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  holds_target boolean;
begin
  if not studeasy.is_admin() then
    if new.role is distinct from old.role then
      select exists (
        select 1 from studeasy.profile_roles
        where profile_id = old.id and role = new.role and status = 'active'
      ) into holds_target;

      if old.role is not null and not holds_target then
        raise exception 'You do not hold that role. Ask StudEasy to add it.';
      end if;

      if old.role is null then
        if new.role = 'admin' then
          raise exception 'The administrator role cannot be self-assigned.';
        end if;
        -- A tutor claiming the role for the first time still needs approval.
        if new.role = 'tutor' then
          new.status := 'pending';
        end if;
      else
        -- Switching to a role they already hold: carry that role's status.
        select pr.status into new.status from studeasy.profile_roles pr
        where pr.profile_id = old.id and pr.role = new.role;
      end if;
    else
      -- Nothing about the role changed, so the status may not move either.
      new.status := old.status;
    end if;

    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.student_code := old.student_code;

    /*
     * parent_id moves only when the student has approved the request, which
     * respond_to_link_request() signals with a transaction-local flag. Without
     * that flag any attempt to write it is silently reverted.
     */
    if coalesce(current_setting('studeasy.link_approved', true), '') <> 'on' then
      new.parent_id := old.parent_id;
    end if;
  end if;

  /*
   * Every student has an ID, whenever they became one. handle_new_user() mints
   * it at signup, but a Google account arrives with no role in its metadata —
   * the role is chosen afterwards, which is an UPDATE. Minting here covers both
   * routes, and sits after the guard so the guard's reset does not undo it.
   */
  if new.role = 'student' and new.student_code is null then
    new.student_code := studeasy.generate_student_code();
  end if;

  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Changing what someone is
-- ---------------------------------------------------------------------------

/*
 * An administrator adds a role to an account.
 *
 * An admin granting tutor IS the approval, so it lands active — making them
 * approve their own grant afterwards would be theatre. `admin` is refused: the
 * allowlist is the only route to it, so one stolen admin session cannot quietly
 * mint more.
 */
create or replace function studeasy.grant_role(
  target uuid,
  wanted studeasy.user_role
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Only a site administrator can change someone''s roles.';
  end if;
  if wanted = 'admin' then
    raise exception 'Administrators are added through the allowlist, not here.';
  end if;

  insert into studeasy.profile_roles
    (profile_id, role, status, granted_by, approved_at, approved_by)
  values (target, wanted, 'active', auth.uid(), now(), auth.uid())
  on conflict (profile_id, role) do update
    set status = 'active',
        approved_at = now(),
        approved_by = auth.uid();

  -- If this is their first role, make it the one they land on.
  update studeasy.profiles
  set role = wanted, status = 'active'
  where id = target and role is null;

  insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, p.id, 'role_granted',
         'You can now use StudEasy as a ' || wanted::text,
         'Switch between your roles from the menu in your portal.',
         '/portal'
  from studeasy.profiles p where p.id = target;
end;
$$;

create or replace function studeasy.revoke_role(
  target uuid,
  unwanted studeasy.user_role
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  remaining studeasy.user_role;
begin
  if not studeasy.is_admin() then
    raise exception 'Only a site administrator can change someone''s roles.';
  end if;
  if unwanted = 'admin' then
    raise exception 'Administrators are removed through the allowlist, not here.';
  end if;

  delete from studeasy.profile_roles
  where profile_id = target and role = unwanted;

  /*
   * If that was the role they were signed in as, move them to another one they
   * hold. Leaving profiles.role pointing at a revoked role would render a
   * dashboard the database then refuses to answer for.
   */
  select pr.role into remaining from studeasy.profile_roles pr
  where pr.profile_id = target and pr.status = 'active'
  order by case pr.role
    when 'admin' then 1 when 'tutor' then 2 when 'parent' then 3 else 4
  end
  limit 1;

  update studeasy.profiles
  set role = remaining,
      status = coalesce(
        (select pr.status from studeasy.profile_roles pr
         where pr.profile_id = target and pr.role = remaining),
        'active'
      )
  where id = target and role = unwanted;
end;
$$;

/*
 * Someone adds a role to their own account.
 *
 * Tutor lands 'pending' — teaching is approved by an administrator, and
 * self-service would walk straight past that. Everything else is active
 * immediately; there is nothing to gate about being a parent.
 */
create or replace function studeasy.request_role(wanted studeasy.user_role)
returns studeasy.account_status
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  resolved studeasy.account_status;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;
  if wanted = 'admin' then
    raise exception 'The administrator role cannot be requested.';
  end if;

  insert into studeasy.profile_roles (profile_id, role, status)
  values (
    caller,
    wanted,
    case when wanted = 'tutor' then 'pending' else 'active' end::studeasy.account_status
  )
  on conflict (profile_id, role) do nothing;

  select pr.status into resolved from studeasy.profile_roles pr
  where pr.profile_id = caller and pr.role = wanted;

  return resolved;
end;
$$;

/* An administrator approves or rejects a claimed role — in practice, tutor. */
create or replace function studeasy.approve_role(
  target uuid,
  wanted studeasy.user_role,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  resolved studeasy.account_status;
begin
  if not studeasy.is_admin() then
    raise exception 'Only a site administrator can approve a role.';
  end if;

  resolved := case when approve then 'active' else 'rejected' end;

  update studeasy.profile_roles
  set status = resolved, approved_at = now(), approved_by = auth.uid()
  where profile_id = target and role = wanted;

  -- Keep the mirrored status honest if this is the role they are signed in as.
  update studeasy.profiles
  set status = resolved, approved_at = now(), approved_by = auth.uid()
  where id = target and role = wanted;

  insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, p.id, 'role_decision',
         case when approve
           then 'Your ' || wanted::text || ' account is approved'
           else 'Your ' || wanted::text || ' request was declined'
         end,
         case when approve
           then 'You can start using it now.'
           else 'Get in touch if you think this is wrong.'
         end,
         '/portal'
  from studeasy.profiles p where p.id = target;
end;
$$;

/* Switch which portal you land in. Only ever between roles you already hold. */
create or replace function studeasy.set_active_role(wanted studeasy.user_role)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
begin
  if not exists (
    select 1 from studeasy.profile_roles
    where profile_id = caller and role = wanted and status = 'active'
  ) then
    raise exception 'You do not hold that role.';
  end if;

  update studeasy.profiles
  set role = wanted, status = 'active'
  where id = caller;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.profile_roles enable row level security;

drop policy if exists profile_roles_select on studeasy.profile_roles;
create policy profile_roles_select on studeasy.profile_roles
  for select using (profile_id = auth.uid() or studeasy.is_admin());

-- Writes go through the functions above only — no insert/update/delete policy.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on studeasy.profile_roles to authenticated;

grant execute on function studeasy.has_role(studeasy.user_role) to authenticated;
grant execute on function studeasy.grant_role(uuid, studeasy.user_role) to authenticated;
grant execute on function studeasy.revoke_role(uuid, studeasy.user_role) to authenticated;
grant execute on function studeasy.request_role(studeasy.user_role) to authenticated;
grant execute on function studeasy.approve_role(uuid, studeasy.user_role, boolean) to authenticated;
grant execute on function studeasy.set_active_role(studeasy.user_role) to authenticated;

revoke all on function studeasy.sync_profile_role() from anon, authenticated;
