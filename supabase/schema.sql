-- StudEasy — authentication and role model.
-- Run once against a new Supabase project (SQL Editor, or `supabase db push`).
--
-- Design note: roles are never trusted from the client. A new account gets its
-- row from a trigger on auth.users, `admin` comes only from the allowlist
-- below, and a guard trigger stops anyone rewriting their own role afterwards.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('student', 'parent', 'tutor', 'admin');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Site administrators
--
-- Membership here is the ONLY way to become an admin. Add a row to grant;
-- existing accounts are promoted on their next sign-in.
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
-- No policies: the allowlist is unreadable and unwritable via the anon/authed
-- API. Only SECURITY DEFINER functions and the service role can see it.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role public.user_role,
  -- Parent -> child link. Required before a under-16 student account is
  -- considered consented under NZ Privacy Act 2020 (PRD section 12).
  parent_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_parent_idx on public.profiles (parent_id);

-- ---------------------------------------------------------------------------
-- Provisioning: create the profile row when an account is created.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.admin_allowlist a
    where lower(a.email) = lower(new.email)
  ) into is_admin;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when is_admin then 'admin'::public.user_role else null end
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        -- Promote an existing account if it was added to the allowlist later,
        -- but never demote or overwrite a role that is already set.
        role       = case
                       when is_admin then 'admin'::public.user_role
                       else public.profiles.role
                     end,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: a signed-in user may claim a role once, and never `admin`.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  if new.role is distinct from old.role then
    select exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    ) into caller_is_admin;

    if not caller_is_admin then
      if old.role is not null then
        raise exception 'Your role is already set. Contact StudEasy to change it.';
      end if;
      if new.role = 'admin' then
        raise exception 'The administrator role cannot be self-assigned.';
      end if;
    end if;
  end if;

  -- Never let the client move these.
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Avoids infinite recursion: an admin check inside a profiles policy cannot
-- itself select from profiles under RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or parent_id = auth.uid()          -- a parent sees their linked children
    or public.is_admin()
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Inserts happen through the trigger only.
drop policy if exists profiles_no_insert on public.profiles;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
