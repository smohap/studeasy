--
-- helpers.sql — pgTAP bootstrap and fixtures.
--
-- Paste into the Supabase SQL Editor once. Safe to re-run.
--
-- Every test file in this directory wraps itself in begin/rollback, so
-- fixtures never survive the run. That is what makes it safe to create real
-- auth.users rows: the profile trigger fires exactly as it does in
-- production, so a test exercises the real thing rather than a hand-built
-- imitation of it.
--

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

/*
 * auth.uid() reads request.jwt.claims ->> 'sub'. Setting it with
 * set_config(..., true) makes the setting local to the transaction, so it
 * disappears on rollback along with everything else.
 */
create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$;

/*
 * Creates a real auth.users row so studeasy_on_auth_user_created runs and
 * builds the profile the way it does for a real signup. Roles other than
 * student/parent/tutor are ignored by that trigger, which is deliberate — a
 * test cannot mint an admin this way, and should not be able to.
 */
create or replace function tests.make_user(email text, role text)
returns uuid
language plpgsql
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (new_id, email, json_build_object('role', role,
                                           'full_name', 'Test ' || role)::jsonb);
  return new_id;
end;
$$;

--
-- Verification, deliberately NOT wrapped in begin/rollback.
--
-- The Supabase SQL Editor runs a whole script inside one transaction of its
-- own, so an explicit `begin` here is a no-op warning and a `rollback` at the
-- end discards the ENTIRE file — the extension, the schema and the three
-- helpers this file exists to install. It reported a passing assertion and
-- left the database untouched, which is exactly what happened the first time
-- this was run.
--
-- The test files DO wrap themselves in begin/rollback, and should: their job is
-- to leave no fixtures behind. This file's job is the opposite.
--
select
  (select count(*) from pg_extension where extname = 'pgtap') = 1
    as pgtap_installed,
  (select count(*) from pg_namespace where nspname = 'tests') = 1
    as tests_schema_exists,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tests') as helper_count;
