-- StudEasy — accounts, roles and registration.
--
-- Everything lives in a dedicated `studeasy` schema rather than `public`,
-- because the Supabase project is shared with other apps. Nothing here touches
-- `public`.
--
-- BEFORE RUNNING: nothing.
-- AFTER RUNNING: add `studeasy` to Supabase -> Settings -> API -> "Exposed
-- schemas". PostgREST refuses to serve a schema that is not listed, and every
-- query from the app will fail until it is.
--
-- Design note: nothing about identity is trusted from the client. Profile rows
-- are created by a trigger on auth.users, `admin` comes only from the
-- allowlist, tutors land in `pending` until an admin approves them, and a guard
-- trigger stops anyone rewriting their own role or status.
--
-- Safe to re-run.

create schema if not exists studeasy;

-- PostgREST connects as these roles; without usage they cannot see the schema.
grant usage on schema studeasy to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role' and n.nspname = 'studeasy'
  ) then
    create type studeasy.user_role as enum ('student', 'parent', 'tutor', 'admin');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'account_status' and n.nspname = 'studeasy'
  ) then
    create type studeasy.account_status as enum ('active', 'pending', 'rejected');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Site administrators
--
-- Membership here is the ONLY route to admin. Existing accounts are promoted
-- on their next sign-in.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.admin_allowlist (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

insert into studeasy.admin_allowlist (email, note)
values ('siddhartha.mohapatra@gmail.com', 'Founder — site administrator')
on conflict (email) do nothing;

alter table studeasy.admin_allowlist enable row level security;
-- Deliberately no policies: unreadable and unwritable through the public API.
-- Only SECURITY DEFINER functions and the service role can see it.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists studeasy.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role studeasy.user_role,
  status studeasy.account_status not null default 'active',

  -- Student
  student_code text unique,          -- the ID a parent quotes to link
  year_level text,
  subjects text[] not null default '{}',

  -- Parent
  parent_id uuid references studeasy.profiles (id) on delete set null,

  -- Tutor
  teaching_subjects text[] not null default '{}',
  approved_at timestamptz,
  approved_by uuid references studeasy.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on studeasy.profiles (role);
create index if not exists profiles_parent_idx on studeasy.profiles (parent_id);
create index if not exists profiles_status_idx on studeasy.profiles (status);

-- ---------------------------------------------------------------------------
-- Student codes — short, unambiguous, quoted by a parent at registration.
-- Crockford-ish alphabet: no I, L, O or U, so nothing reads as a digit.
-- ---------------------------------------------------------------------------

create or replace function studeasy.generate_student_code()
returns text
language plpgsql
set search_path = studeasy, public
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  i integer;
begin
  loop
    candidate := 'STU-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from studeasy.profiles where student_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisioning: build the profile when the account is created.
--
-- Everything the registration wizard collected arrives in raw_user_meta_data.
-- ---------------------------------------------------------------------------

create or replace function studeasy.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  is_admin boolean;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := meta ->> 'role';
  resolved_role studeasy.user_role;
  resolved_status studeasy.account_status;
begin
  select exists (
    select 1 from studeasy.admin_allowlist a where lower(a.email) = lower(new.email)
  ) into is_admin;

  -- A client may ask for student/parent/tutor. Anything else is ignored.
  if is_admin then
    resolved_role := 'admin';
  elsif wanted in ('student', 'parent', 'tutor') then
    resolved_role := wanted::studeasy.user_role;
  else
    resolved_role := null;
  end if;

  -- Tutors are not live until a site admin approves them.
  resolved_status := case when resolved_role = 'tutor' then 'pending' else 'active' end;

  insert into studeasy.profiles (
    id, email, full_name, avatar_url, role, status,
    student_code, year_level, subjects, teaching_subjects
  )
  values (
    new.id,
    new.email,
    coalesce(meta ->> 'full_name', meta ->> 'name'),
    meta ->> 'avatar_url',
    resolved_role,
    resolved_status,
    case when resolved_role = 'student' then studeasy.generate_student_code() else null end,
    case when resolved_role = 'student' then meta ->> 'year_level' else null end,
    case
      when resolved_role = 'student' and meta ? 'subjects'
      then array(select jsonb_array_elements_text(meta -> 'subjects'))
      else '{}'::text[]
    end,
    case
      when resolved_role = 'tutor' and meta ? 'teaching_subjects'
      then array(select jsonb_array_elements_text(meta -> 'teaching_subjects'))
      else '{}'::text[]
    end
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, studeasy.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, studeasy.profiles.avatar_url),
        -- Promote if allowlisted later; never demote or clobber a set role.
        role       = case when is_admin then 'admin'::studeasy.user_role
                          else studeasy.profiles.role end,
        status     = case when is_admin then 'active'::studeasy.account_status
                          else studeasy.profiles.status end,
        updated_at = now();

  return new;
end;
$$;

-- Named for this app. A generic `on_auth_user_created` would silently replace
-- a trigger another app in this shared project may already own.
drop trigger if exists studeasy_on_auth_user_created on auth.users;
create trigger studeasy_on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function studeasy.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: what a signed-in user may not change about themselves.
-- ---------------------------------------------------------------------------

create or replace function studeasy.is_admin()
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function studeasy.guard_profile()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    if new.role is distinct from old.role then
      if old.role is not null then
        raise exception 'Your role is already set. Contact StudEasy to change it.';
      end if;
      if new.role = 'admin' then
        raise exception 'The administrator role cannot be self-assigned.';
      end if;
      -- A tutor claiming the role for the first time still needs approval.
      if new.role = 'tutor' then
        new.status := 'pending';
      end if;
    end if;

    -- Only an admin moves these.
    new.status := coalesce(
      case when new.role = 'tutor' and old.role is null then new.status else null end,
      old.status
    );
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

  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard on studeasy.profiles;
create trigger profiles_guard
  before update on studeasy.profiles
  for each row execute function studeasy.guard_profile();

-- ---------------------------------------------------------------------------
-- Parent -> student linking, by request and confirmation.
--
-- Quoting a Student ID is a request, not a link. The student has to approve it
-- before the parent can see anything, because holding a six-character code is
-- not proof of a family relationship — and this is a minor's record.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.link_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references studeasy.profiles (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- One live request per pair; answered ones stay as history and may be re-asked.
create unique index if not exists link_requests_one_pending
  on studeasy.link_requests (parent_id, student_id)
  where status = 'pending';

create index if not exists link_requests_student_idx
  on studeasy.link_requests (student_id, status);

alter table studeasy.link_requests enable row level security;

drop policy if exists link_requests_select on studeasy.link_requests;
create policy link_requests_select on studeasy.link_requests
  for select using (
    parent_id = auth.uid() or student_id = auth.uid() or studeasy.is_admin()
  );

-- Writes go through the functions below only.

/*
 * A parent asks. Returns the resulting state and nothing identifying: echoing
 * the student's name back would turn this into a way of testing codes to see
 * whose they are.
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
  if not exists (
    select 1 from studeasy.profiles where id = caller and role = 'parent'
  ) then
    raise exception 'Only a parent account can link a student.';
  end if;

  select * into student
  from studeasy.profiles
  where student_code = upper(trim(code)) and role = 'student';

  if not found then
    raise exception 'We could not find a student with that ID. Check it with your child.';
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

  return 'requested';
end;
$$;

/* The student answers. Only they can, and only once. */
create or replace function studeasy.respond_to_link_request(request uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  req studeasy.link_requests%rowtype;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;

  select * into req from studeasy.link_requests where id = request;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if req.student_id <> caller then
    raise exception 'Only the student named on the request can answer it.';
  end if;
  if req.status <> 'pending' then
    raise exception 'That request has already been answered.';
  end if;

  update studeasy.link_requests
  set status = case when accept then 'approved' else 'declined' end,
      decided_at = now()
  where id = request;

  if accept then
    -- Tells guard_profile() this parent_id write is legitimate. Transaction-local.
    perform set_config('studeasy.link_approved', 'on', true);
    update studeasy.profiles
    set parent_id = req.parent_id, updated_at = now()
    where id = caller;
  end if;
end;
$$;

/*
 * Requests waiting on the signed-in student, with who is asking. A student
 * cannot read a parent's profile directly, so this joins it for them.
 */
create or replace function studeasy.my_link_requests()
returns table (id uuid, parent_name text, parent_email text, asked_at timestamptz)
language sql
security definer
set search_path = studeasy, public
as $$
  select r.id, p.full_name, p.email, r.created_at
  from studeasy.link_requests r
  join studeasy.profiles p on p.id = r.parent_id
  where r.student_id = auth.uid() and r.status = 'pending'
  order by r.created_at;
$$;

/* The parent's own outstanding requests, by code — no student details. */
create or replace function studeasy.my_pending_links()
returns table (id uuid, student_code text, asked_at timestamptz)
language sql
security definer
set search_path = studeasy, public
as $$
  select r.id, s.student_code, r.created_at
  from studeasy.link_requests r
  join studeasy.profiles s on s.id = r.student_id
  where r.parent_id = auth.uid() and r.status = 'pending'
  order by r.created_at;
$$;

-- Superseded: it linked without asking the student.
drop function if exists studeasy.link_parent_to_student(text);

-- ---------------------------------------------------------------------------
-- Tutor approval — admin only.
-- ---------------------------------------------------------------------------

create or replace function studeasy.set_tutor_status(
  tutor uuid,
  next studeasy.account_status
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Only a site administrator can do that.';
  end if;

  update studeasy.profiles
  set status = next,
      approved_at = case when next = 'active' then now() else null end,
      approved_by = case when next = 'active' then auth.uid() else null end,
      updated_at = now()
  where id = tutor and role = 'tutor';
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.profiles enable row level security;

drop policy if exists profiles_select on studeasy.profiles;
create policy profiles_select on studeasy.profiles
  for select using (
    id = auth.uid()
    or parent_id = auth.uid()      -- a parent sees their linked children
    or studeasy.is_admin()
  );

drop policy if exists profiles_update on studeasy.profiles;
create policy profiles_update on studeasy.profiles
  for update using (id = auth.uid() or studeasy.is_admin())
  with check (id = auth.uid() or studeasy.is_admin());

-- Inserts happen through the signup trigger only — no insert policy.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, update on studeasy.profiles to authenticated;
grant select on studeasy.link_requests to authenticated;

grant execute on function studeasy.request_student_link(text) to authenticated;
grant execute on function studeasy.respond_to_link_request(uuid, boolean) to authenticated;
grant execute on function studeasy.my_link_requests() to authenticated;
grant execute on function studeasy.my_pending_links() to authenticated;
grant execute on function studeasy.set_tutor_status(uuid, studeasy.account_status)
  to authenticated;

-- Internal only: callable by the signup trigger, not by clients.
revoke all on function studeasy.generate_student_code() from public;
revoke all on function studeasy.handle_new_user() from public;
revoke all on function studeasy.guard_profile() from public;
