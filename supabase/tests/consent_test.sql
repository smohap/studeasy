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
 * Identities are random, and captured transaction-locally.
 *
 * The first version of this file used fixed UUIDs because the child's id is
 * referenced a dozen times and current_setting() at each mention is noisier.
 * That was the wrong trade: the file then collided with itself the moment a
 * run left anything behind, and no amount of deleting first fixed it. Random
 * ids cannot collide at all, which is precisely why tests.make_user() — and
 * therefore every other test file here — has never hit this.
 *
 * make_user() itself is not used because it has no way to pass a date of
 * birth, which is the one input this whole file is about.
 */
select set_config('t.child', gen_random_uuid()::text, true);
select set_config('t.grown', gen_random_uuid()::text, true);
select set_config('t.mum',   gen_random_uuid()::text, true);
select set_config('t.other', gen_random_uuid()::text, true);
select set_config('t.paper', gen_random_uuid()::text, true);

-- A student of 13, a student of 17, and a parent for each. Emails are built
-- from the ids so they cannot collide either.
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('t.child')::uuid,
   'child-' || current_setting('t.child') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Child Under',
                      'date_of_birth', (current_date - interval '13 years')::date::text)),
  (current_setting('t.grown')::uuid,
   'grown-' || current_setting('t.grown') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Grown Enough',
                      'date_of_birth', (current_date - interval '17 years')::date::text)),
  (current_setting('t.mum')::uuid,
   'mum-' || current_setting('t.mum') || '@test.invalid',
   jsonb_build_object('role', 'parent', 'full_name', 'Linked Parent')),
  (current_setting('t.other')::uuid,
   'stranger-' || current_setting('t.other') || '@test.invalid',
   jsonb_build_object('role', 'parent', 'full_name', 'Unlinked Parent'));

/*
 * The child's Student ID, captured here as the owner.
 *
 * It cannot be looked up later from inside the parent's session: a parent who
 * is not yet linked cannot see the child's profile at all, so a subselect for
 * student_code returns null and request_student_link() reports that no such
 * student exists. That is RLS behaving correctly, and it silently broke seven
 * assertions downstream of it.
 *
 * The rule this file follows from here: ACT as the user under test, but READ
 * as the owner. An assertion that depends on the caller's visibility is
 * testing RLS by accident rather than testing the thing it names.
 */
select set_config('t.code',
                  (select student_code from studeasy.profiles
                   where id = current_setting('t.child')::uuid),
                  true);

-- A published assessment to attempt.
insert into studeasy.assessments (id, organization_id, title, status)
select current_setting('t.paper')::uuid, studeasy.default_org(),
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
   where id = current_setting('t.child')::uuid),
  null,
  'the thirteen-year-old registers with no basis at all'
);

select is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.grown')::uuid),
  'not_required',
  'the seventeen-year-old is cleared without anyone being asked'
);

select is(
  (select date_of_birth from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  (current_date - interval '13 years')::date,
  'the date of birth from the registration form reached the profile'
);

select ok(
  studeasy.consent_pending(current_setting('t.child')::uuid),
  'the younger student is gated'
);

select ok(
  not studeasy.consent_pending(current_setting('t.grown')::uuid),
  'the older student is not'
);

-- ---------------------------------------------------------------------------
-- As the gated child. The seam: can they let themselves through?
-- ---------------------------------------------------------------------------

select tests.authenticate_as(current_setting('t.child')::uuid);

-- Silently reverted rather than refused, so the attempt tells them nothing.
update studeasy.profiles
set consent_basis = 'parent', consent_granted_at = now()
where id = current_setting('t.child')::uuid;

select is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  null,
  'a student writing their own consent_basis is reverted, not obeyed'
);

update studeasy.profiles
set date_of_birth = (current_date - interval '30 years')::date
where id = current_setting('t.child')::uuid;

select is(
  (select date_of_birth from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  (current_date - interval '13 years')::date,
  'and cannot age themselves out of the gate — the date of birth is write-once'
);

select throws_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values (current_setting('t.paper')::uuid,
              current_setting('t.child')::uuid) $t$,
  '23514',
  null,
  'a gated student cannot start an attempt'
);

-- ---------------------------------------------------------------------------
-- The older student, by contrast, is unimpeded.
-- ---------------------------------------------------------------------------

/*
 * reset role before every switch from here on.
 *
 * tests.authenticate_as() does SET ROLE authenticated, and `authenticated` has
 * no USAGE on the tests schema — deliberately, because that function sets
 * arbitrary jwt claims and granting it would hand every signed-in account an
 * impersonation primitive. So the SECOND call to it fails with 42501 unless
 * the role goes back to the owner first. reset role needs no schema access at
 * all, which is why it is this and not tests.clear_auth().
 */
reset role;
select tests.authenticate_as(current_setting('t.grown')::uuid);

select lives_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values (current_setting('t.paper')::uuid,
              current_setting('t.grown')::uuid) $t$,
  'a student over sixteen sits the paper with nobody being asked'
);

-- ---------------------------------------------------------------------------
-- Who may lift the gate
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.other')::uuid);

select throws_ok(
  $t$ select studeasy.grant_parental_consent(
        current_setting('t.child')::uuid) $t$,
  'P0001',
  'You are not linked to that student.',
  'a parent account that is not linked to the child cannot consent for them'
);

-- ---------------------------------------------------------------------------
-- The deadlock. A gated child's only route out is approving the parent who
-- can lift the gate, so that one action has to work while they are gated.
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.mum')::uuid);

select lives_ok(
  $t$ select studeasy.request_student_link(current_setting('t.code')) $t$,
  'the parent may ask to follow a gated child'
);

reset role;
select tests.authenticate_as(current_setting('t.child')::uuid);

select lives_ok(
  $t$ select studeasy.respond_to_link_request(
        (select id from studeasy.link_requests
         where student_id = current_setting('t.child')::uuid
           and status = 'pending'),
        true) $t$,
  'and a gated child may answer it — otherwise the account is stuck forever'
);

-- ---------------------------------------------------------------------------
-- Consent, and what it opens
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.mum')::uuid);

select lives_ok(
  $t$ select studeasy.grant_parental_consent(
        current_setting('t.child')::uuid) $t$,
  'the linked parent confirms'
);

-- Read as the owner, not as mum: what is being checked is what consent wrote,
-- not whether a parent happens to be able to see it.
reset role;

select is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  'parent',
  'the basis records that it came from a parent, not that a box was ticked'
);

select is(
  (select consent_granted_by from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  current_setting('t.mum')::uuid,
  'and names which one'
);

reset role;
select tests.authenticate_as(current_setting('t.child')::uuid);

select lives_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values (current_setting('t.paper')::uuid,
              current_setting('t.child')::uuid) $t$,
  'the child can now sit the paper'
);

-- ---------------------------------------------------------------------------
-- Withdrawal, and the stale-consent seam: unlinking has to take it with it.
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.mum')::uuid);

select lives_ok(
  $t$ select studeasy.unlink_student(current_setting('t.child')::uuid) $t$,
  'the parent removes the link'
);

select ok(
  studeasy.consent_pending(current_setting('t.child')::uuid),
  'which re-gates the child — a consent from an absent guardian is not one'
);

/*
 * And again on the way out. rollback should make this redundant; it is here
 * because "should" is what the first run of this file relied on.
 *
 * Both halves of the identity have to go, not just the role.
 *
 * reset role restores the owner, but it leaves request.jwt.claims naming
 * whoever authenticate_as() last set — so auth.uid() still returns a test
 * user. Deleting these accounts cascades to their profiles and their
 * profile_roles, the profile_roles delete fires audit.sql's write_audit(), and
 * that records actor_id = auth.uid() against a profile row being deleted in
 * the same statement. audit_log.actor_id is a foreign key into profiles, so
 * the insert fails with 23503 and takes the whole file with it.
 *
 * Clearing the claims makes auth.uid() null, and write_audit()'s own comment
 * says what a null actor means there: no signed-in person was responsible.
 * Which is the truth about a cleanup step.
 *
 * set_config rather than tests.clear_auth(), which does exactly this but lives
 * in a schema the authenticated role cannot reach.
 */
reset role;
select set_config('request.jwt.claims', null, true);


delete from auth.users where id in (
  current_setting('t.child')::uuid, current_setting('t.grown')::uuid,
  current_setting('t.mum')::uuid,   current_setting('t.other')::uuid
);
delete from studeasy.assessments where id = current_setting('t.paper')::uuid;

select coalesce(
         string_agg(line, chr(10)),
         'PASS - every assertion in this file succeeded.'
       ) as tap_result
from finish() as t(line);

rollback;
