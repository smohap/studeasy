--
-- diagnose-dob.sql — where does the date of birth get lost?
--
-- Not a test. Run it, paste the single row it returns, throw it away.
--
-- Five assertions in consent_test.sql fail together, and all five depend on
-- one thing: date_of_birth reaching studeasy.profiles from the registration
-- metadata. This registers one seventeen-year-old exactly the way the fixtures
-- do and reports each stage, so the stage that drops it is visible rather than
-- inferred.
--
begin;

select set_config('d.u', gen_random_uuid()::text, true);

insert into auth.users (id, email, raw_user_meta_data)
values (
  current_setting('d.u')::uuid,
  'diag-' || current_setting('d.u') || '@test.invalid',
  jsonb_build_object(
    'role', 'student',
    'full_name', 'Diagnostic Seventeen',
    'date_of_birth', (current_date - interval '17 years')::date::text
  )
);

select
  -- Was the trigger created at all? consent.sql's own verification never
  -- checked this one.
  (select count(*) from pg_trigger
    where tgname = 'studeasy_on_auth_user_dob')              as dob_trigger,
  (select count(*) from pg_trigger
    where tgname = 'profiles_guard_consent')                 as consent_guard,

  -- Did the date survive into the metadata the trigger reads?
  (select u.raw_user_meta_data ->> 'date_of_birth'
     from auth.users u where u.id = current_setting('d.u')::uuid) as metadata_dob,

  -- Did a profile get built, and with what?
  (select p.role::text from studeasy.profiles p
     where p.id = current_setting('d.u')::uuid)              as profile_role,
  (select p.date_of_birth::text from studeasy.profiles p
     where p.id = current_setting('d.u')::uuid)              as profile_dob,
  (select p.consent_basis from studeasy.profiles p
     where p.id = current_setting('d.u')::uuid)              as basis,

  -- And does the predicate agree a seventeen-year-old is clear?
  studeasy.needs_guardian_consent(
    (current_date - interval '17 years')::date)              as seventeen_needs_consent,
  studeasy.consent_pending(current_setting('d.u')::uuid)     as still_gated;

reset role;
select set_config('request.jwt.claims', null, true);
delete from auth.users where id = current_setting('d.u')::uuid;

rollback;
