-- StudEasy — accounts, roles and registration.
-- Run once against a new Supabase project (SQL Editor, or `supabase db push`).
--
-- Design note: nothing about identity is trusted from the client. Profile rows
-- are created by a trigger on auth.users, `admin` comes only from the allowlist,
-- tutors land in `pending` until an admin approves them, and a guard trigger
-- stops anyone rewriting their own role or status.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('student', 'parent', 'tutor', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'pending', 'rejected');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Site administrators
--
-- Membership here is the ONLY route to admin. Existing accounts are promoted
-- on their next sign-in.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_allowlist (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

insert into public.admin_allowlist (email, note)
values ('siddhartha.mohapatra@gmail.com', 'Founder — site administrator')
on conflict (email) do nothing;

alter table public.admin_allowlist enable row level security;
-- Deliberately no policies: unreadable and unwritable through the public API.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role public.user_role,
  status public.account_status not null default 'active',

  -- Student
  student_code text unique,          -- the ID a parent quotes to link
  year_level text,
  subjects text[] not null default '{}',

  -- Parent
  parent_id uuid references public.profiles (id) on delete set null,

  -- Tutor
  teaching_subjects text[] not null default '{}',
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_parent_idx on public.profiles (parent_id);
create index if not exists profiles_status_idx on public.profiles (status);

-- ---------------------------------------------------------------------------
-- Student codes — short, unambiguous, quoted by a parent at registration.
-- Crockford-ish alphabet: no I, L, O or U, so nothing reads as a digit.
-- ---------------------------------------------------------------------------

create or replace function public.generate_student_code()
returns text
language plpgsql
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
    exit when not exists (select 1 from public.profiles where student_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisioning: build the profile when the account is created.
--
-- Everything the registration wizard collected arrives in raw_user_meta_data.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := meta ->> 'role';
  resolved_role public.user_role;
  resolved_status public.account_status;
begin
  select exists (
    select 1 from public.admin_allowlist a where lower(a.email) = lower(new.email)
  ) into is_admin;

  -- A client may ask for student/parent/tutor. Anything else is ignored.
  if is_admin then
    resolved_role := 'admin';
  elsif wanted in ('student', 'parent', 'tutor') then
    resolved_role := wanted::public.user_role;
  else
    resolved_role := null;
  end if;

  -- Tutors are not live until a site admin approves them.
  resolved_status := case when resolved_role = 'tutor' then 'pending' else 'active' end;

  insert into public.profiles (
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
    case when resolved_role = 'student' then public.generate_student_code() else null end,
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
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        -- Promote if allowlisted later; never demote or clobber a set role.
        role       = case when is_admin then 'admin'::public.user_role
                          else public.profiles.role end,
        status     = case when is_admin then 'active'::public.account_status
                          else public.profiles.status end,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: what a signed-in user may not change about themselves.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
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
    new.parent_id := old.parent_id;   -- set only via link_parent_to_student()
  end if;

  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------------------------------------------------------------------------
-- Parent -> student linking.
--
-- SECURITY DEFINER so a parent can redeem a code without being able to read
-- the student table. Rate limiting belongs in front of this in production.
-- ---------------------------------------------------------------------------

create or replace function public.link_parent_to_student(code text)
returns table (student_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  student public.profiles%rowtype;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;
  if not exists (select 1 from public.profiles where id = caller and role = 'parent') then
    raise exception 'Only a parent account can link a student.';
  end if;

  select * into student
  from public.profiles
  where student_code = upper(trim(code)) and role = 'student';

  if not found then
    raise exception 'We could not find a student with that ID. Check it with your child.';
  end if;

  update public.profiles set parent_id = caller, updated_at = now()
  where id = student.id;

  return query select student.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tutor approval — admin only.
-- ---------------------------------------------------------------------------

create or replace function public.set_tutor_status(tutor uuid, next public.account_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only a site administrator can do that.';
  end if;
  if next not in ('active', 'rejected', 'pending') then
    raise exception 'Unsupported status.';
  end if;

  update public.profiles
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

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or parent_id = auth.uid()      -- a parent sees their linked children
    or public.is_admin()
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Inserts happen through the signup trigger only.

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.link_parent_to_student(text) to authenticated;
grant execute on function public.set_tutor_status(uuid, public.account_status) to authenticated;
revoke execute on function public.generate_student_code() from anon, authenticated;
