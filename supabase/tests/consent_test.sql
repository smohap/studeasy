--
-- consent_test.sql — the under-16 gate.
--
-- Run supabase/tests/helpers.sql once first, then this file on its own.
--
-- The assertions worth reading are the ones about seams rather than happy
-- paths: that a child cannot clear their own gate, cannot revise the date of
-- birth that set it, and is still able to answer the link request that is
-- their only way out.
--
begin;
set local search_path = pg_temp, extensions, studeasy, public;

select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures. All of this runs as the owner, ABOVE the first authenticate_as:
-- these rows are refused by RLS once a non-owner role is in force.
-- ---------------------------------------------------------------------------

/*
 * Clear anything a previous run left behind.
 *
 * This file uses fixed UUIDs rather than tests.make_user()'s random ones,
 * because the child's id is referenced a dozen times below and
 * current_setting('...')::uuid at every mention would bury the assertions. The
 * cost of that choice is that the file collides with itself if a run ever
 * fails to unwind — which is exactly what happened the first time it was run.
 *
 * So it cleans up at BOTH ends: here, and again before finish() below. Scoped
 * to four literal @test.invalid addresses, so there is no expression here that
 * could reach a real account even if it were run against production by
 * mistake. The delete cascades to profiles and everything hanging off them.
 */
delete from auth.users where email in (
  'child@test.invalid', 'grown@test.invalid',
  'mum@test.invalid', 'stranger@test.invalid'
);
delete from studeasy.assessments
where id = '55555555-5555-5555-5555-555555555555';

-- A student of 13, a student of 17, and a parent for each.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'child@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Child Under',
                      'date_of_birth', (current_date - interval '13 years')::date::text)),
  ('22222222-2222-2222-2222-222222222222', 'grown@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Grown Enough',
                      'date_of_birth', (current_date - interval '17 years')::date::text)),
  ('33333333-3333-3333-3333-333333333333', 'mum@test.invalid',
   jsonb_build_object('role', 'parent', 'full_name', 'Linked Parent')),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.invalid',
   jsonb_build_object('role', 'parent', 'full_name', 'Unlinked Parent'));

-- A published assessment to attempt.
insert into studeasy.assessments (id, organization_id, title, status)
select '55555555-5555-5555-5555-555555555555', studeasy.default_org(),
       'Gate test paper', 'published';

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

select has_column('studeasy', 'profiles', 'date_of_birth', 'profiles.date_of_birth exists');
select has_column('studeasy', 'profiles', 'consent_basis', 'profiles.consent_basis exists');
select has_function('studeasy', 'consent_pending', 'consent_pending() exists');
select has_function('studeasy', 'grant_parental_consent', 'grant_parental_consent() exists');

-- ---------------------------------------------------------------------------
-- The age test itself, including the fail-closed case
-- ---------------------------------------------------------------------------

select ok(
  studeasy.needs_guardian_consent((current_date - interval '14 years')::date),
  'a fourteen-year-old needs a guardian'
);

select ok(
  not studeasy.needs_guardian_consent((current_date - interval '20 years')::date),
  'a twenty-year-old does not'
);

select ok(
  studeasy.needs_guardian_consent(null),
  'an unknown age counts as a child — the predicate fails closed'
);

-- ---------------------------------------------------------------------------
-- What registration produced
-- ---------------------------------------------------------------------------

select is(
  (select consent_basis from studeasy.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'the thirteen-year-old registers with no basis at all'
);

select is(
  (select consent_basis from studeasy.profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  'not_required',
  'the seventeen-year-old is cleared without anyone being asked'
);

select is(
  (select date_of_birth from studeasy.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  (current_date - interval '13 years')::date,
  'the date of birth from the registration form reached the profile'
);

select ok(
  studeasy.consent_pending('11111111-1111-1111-1111-111111111111'),
  'the younger student is gated'
);

select ok(
  not studeasy.consent_pending('22222222-2222-2222-2222-222222222222'),
  'the older student is not'
);

-- ---------------------------------------------------------------------------
-- As the gated child. The seam: can they let themselves through?
-- ---------------------------------------------------------------------------

select tests.authenticate_as('11111111-1111-1111-1111-111111111111');

-- Silently reverted rather than refused, so the attempt tells them nothing.
update studeasy.profiles
set consent_basis = 'parent', consent_granted_at = now()
where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select consent_basis from studeasy.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'a student writing their own consent_basis is reverted, not obeyed'
);

update studeasy.profiles
set date_of_birth = (current_date - interval '30 years')::date
where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select date_of_birth from studeasy.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  (current_date - interval '13 years')::date,
  'and cannot age themselves out of the gate — the date of birth is write-once'
);

select throws_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values ('55555555-5555-5555-5555-555555555555',
              '11111111-1111-1111-1111-111111111111') $t$,
  '23514',
  null,
  'a gated student cannot start an attempt'
);

-- ---------------------------------------------------------------------------
-- The older student, by contrast, is unimpeded.
-- ---------------------------------------------------------------------------

select tests.authenticate_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values ('55555555-5555-5555-5555-555555555555',
              '22222222-2222-2222-2222-222222222222') $t$,
  'a student over sixteen sits the paper with nobody being asked'
);

-- ---------------------------------------------------------------------------
-- Who may lift the gate
-- ---------------------------------------------------------------------------

select tests.authenticate_as('44444444-4444-4444-4444-444444444444');

select throws_ok(
  $t$ select studeasy.grant_parental_consent(
        '11111111-1111-1111-1111-111111111111') $t$,
  'P0001',
  'You are not linked to that student.',
  'a parent account that is not linked to the child cannot consent for them'
);

-- ---------------------------------------------------------------------------
-- The deadlock. A gated child's only route out is approving the parent who
-- can lift the gate, so that one action has to work while they are gated.
-- ---------------------------------------------------------------------------

select tests.authenticate_as('33333333-3333-3333-3333-333333333333');

select lives_ok(
  $t$ select studeasy.request_student_link(
        (select student_code from studeasy.profiles
         where id = '11111111-1111-1111-1111-111111111111')) $t$,
  'the parent may ask to follow a gated child'
);

select tests.authenticate_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $t$ select studeasy.respond_to_link_request(
        (select id from studeasy.link_requests
         where student_id = '11111111-1111-1111-1111-111111111111'
           and status = 'pending'),
        true) $t$,
  'and a gated child may answer it — otherwise the account is stuck forever'
);

-- ---------------------------------------------------------------------------
-- Consent, and what it opens
-- ---------------------------------------------------------------------------

select tests.authenticate_as('33333333-3333-3333-3333-333333333333');

select lives_ok(
  $t$ select studeasy.grant_parental_consent(
        '11111111-1111-1111-1111-111111111111') $t$,
  'the linked parent confirms'
);

select is(
  (select consent_basis from studeasy.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  'parent',
  'the basis records that it came from a parent, not that a box was ticked'
);

select is(
  (select consent_granted_by from studeasy.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'and names which one'
);

select tests.authenticate_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values ('55555555-5555-5555-5555-555555555555',
              '11111111-1111-1111-1111-111111111111') $t$,
  'the child can now sit the paper'
);

-- ---------------------------------------------------------------------------
-- Withdrawal, and the stale-consent seam: unlinking has to take it with it.
-- ---------------------------------------------------------------------------

select tests.authenticate_as('33333333-3333-3333-3333-333333333333');

select lives_ok(
  $t$ select studeasy.unlink_student('11111111-1111-1111-1111-111111111111') $t$,
  'the parent removes the link'
);

select ok(
  studeasy.consent_pending('11111111-1111-1111-1111-111111111111'),
  'which re-gates the child — a consent from an absent guardian is not one'
);

/*
 * And again on the way out, as the owner rather than as whoever the last
 * authenticate_as() left us. rollback should make this redundant; it is here
 * because "should" is what the first run of this file relied on.
 */
reset role;
delete from auth.users where email in (
  'child@test.invalid', 'grown@test.invalid',
  'mum@test.invalid', 'stranger@test.invalid'
);
delete from studeasy.assessments
where id = '55555555-5555-5555-5555-555555555555';

select coalesce(
         string_agg(line, chr(10)),
         'PASS - every assertion in this file succeeded.'
       ) as tap_result
from finish() as t(line);

rollback;
