--
-- consent_test.sql — the under-13 gate.
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

/*
 * Reading the result of every assertion, which is harder than it should be.
 *
 * finish() returns ONLY the summary line. Each `select ok(...)` returns its own
 * "ok N - description" as that STATEMENT's result set, and the Supabase editor
 * shows only the LAST result set a script produces — so all 25 lines were
 * computed and discarded, and four consecutive runs reported nothing but
 * "Looks like you failed 5 tests of 25".
 *
 * pgTAP keeps no per-assertion record to read back afterwards. Its only temp
 * table is __tcache__, which holds three counters: plan, failed, curr_test.
 * The detail exists for the duration of one statement and then it is gone.
 *
 * So each assertion below appends its line to a transaction-local setting as
 * it runs, and the verdict reads them back. A setting is the one channel that
 * needs no privileges, survives every `set role`, and disappears on rollback —
 * a table would need grants that the `authenticated` role deliberately does
 * not have, which is what defeated the earlier attempt at this.
 */

select plan(26);

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

-- A student of 10 and one of exactly 13 — the boundary — plus a parent for
-- each. Emails are built
-- from the ids so they cannot collide either.
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('t.child')::uuid,
   'child-' || current_setting('t.child') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Child Under',
                      'date_of_birth', (current_date - interval '10 years')::date::text)),
  (current_setting('t.grown')::uuid,
   'grown-' || current_setting('t.grown') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Grown Enough',
                      'date_of_birth', (current_date - interval '13 years')::date::text)),
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

select set_config('t.log', coalesce(current_setting('t.log', true), '') || has_column('studeasy', 'profiles', 'date_of_birth', 'profiles.date_of_birth exists') || chr(10), true);
select set_config('t.log', coalesce(current_setting('t.log', true), '') || has_column('studeasy', 'profiles', 'consent_basis', 'profiles.consent_basis exists') || chr(10), true);
select set_config('t.log', coalesce(current_setting('t.log', true), '') || has_function('studeasy', 'consent_pending', 'consent_pending() exists') || chr(10), true);
select set_config('t.log', coalesce(current_setting('t.log', true), '') || has_function('studeasy', 'grant_parental_consent', 'grant_parental_consent() exists') || chr(10), true);

-- ---------------------------------------------------------------------------
-- The age test itself, including the fail-closed case
-- ---------------------------------------------------------------------------

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  studeasy.needs_guardian_consent((current_date - interval '10 years')::date),
  'a ten-year-old needs a guardian'
) || chr(10), true);

-- The case the threshold was moved for, and deliberately ON the boundary:
-- exactly thirteen today, which must read as clear rather than as a child.
select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  not studeasy.needs_guardian_consent((current_date - interval '13 years')::date),
  'a thirteen-year-old does not — they hold their own account'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  studeasy.needs_guardian_consent(null),
  'an unknown age counts as a child — the predicate fails closed'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- What registration produced
-- ---------------------------------------------------------------------------

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  null,
  'the ten-year-old registers with no basis at all'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.grown')::uuid),
  'not_required',
  'the thirteen-year-old is cleared without anyone being asked'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select date_of_birth from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  (current_date - interval '10 years')::date,
  'the date of birth from the registration form reached the profile'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  studeasy.consent_pending(current_setting('t.child')::uuid),
  'the younger student is gated'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  not studeasy.consent_pending(current_setting('t.grown')::uuid),
  'the older student is not'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- As the gated child. The seam: can they let themselves through?
-- ---------------------------------------------------------------------------

select tests.authenticate_as(current_setting('t.child')::uuid);

-- Silently reverted rather than refused, so the attempt tells them nothing.
update studeasy.profiles
set consent_basis = 'parent', consent_granted_at = now()
where id = current_setting('t.child')::uuid;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  null,
  'a student writing their own consent_basis is reverted, not obeyed'
) || chr(10), true);

update studeasy.profiles
set date_of_birth = (current_date - interval '30 years')::date
where id = current_setting('t.child')::uuid;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select date_of_birth from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  (current_date - interval '10 years')::date,
  'and cannot age themselves out of the gate — the date of birth is write-once'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || throws_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values (current_setting('t.paper')::uuid,
              current_setting('t.child')::uuid) $t$,
  '23514',
  null,
  'a gated student cannot start an attempt'
) || chr(10), true);

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

select set_config('t.log', coalesce(current_setting('t.log', true), '') || lives_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values (current_setting('t.paper')::uuid,
              current_setting('t.grown')::uuid) $t$,
  'a student of thirteen sits the paper with nobody being asked'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Who may lift the gate
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.other')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || throws_ok(
  $t$ select studeasy.grant_parental_consent(
        current_setting('t.child')::uuid) $t$,
  'P0001',
  'You are not linked to that student.',
  'a parent account that is not linked to the child cannot consent for them'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- The deadlock. A gated child's only route out is approving the parent who
-- can lift the gate, so that one action has to work while they are gated.
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.mum')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || lives_ok(
  $t$ select studeasy.request_student_link(current_setting('t.code')) $t$,
  'the parent may ask to follow a gated child'
) || chr(10), true);

reset role;
select tests.authenticate_as(current_setting('t.child')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || lives_ok(
  $t$ select studeasy.respond_to_link_request(
        (select id from studeasy.link_requests
         where student_id = current_setting('t.child')::uuid
           and status = 'pending'),
        true) $t$,
  'and a gated child may answer it — otherwise the account is stuck forever'
) || chr(10), true);

/*
 * The flag respond_to_link_request() just set must not still be open.
 *
 * It authorises one write to parent_id. set_config(..., true) is local to the
 * TRANSACTION, so a flag left on would let the student who just approved a
 * parent go on to attach themselves to anybody — which is exactly the
 * safeguard family.sql exists to provide. The consent guard had this same bug
 * and five assertions failed on it; this is the one that would have caught its
 * twin.
 */
update studeasy.profiles
set parent_id = current_setting('t.other')::uuid
where id = current_setting('t.child')::uuid;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select parent_id from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  current_setting('t.mum')::uuid,
  'and cannot then re-point their own parent_id — the flag closed behind them'
) || chr(10), true);


-- ---------------------------------------------------------------------------
-- Consent, and what it opens
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.mum')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || lives_ok(
  $t$ select studeasy.grant_parental_consent(
        current_setting('t.child')::uuid) $t$,
  'the linked parent confirms'
) || chr(10), true);

-- Read as the owner, not as mum: what is being checked is what consent wrote,
-- not whether a parent happens to be able to see it.
reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_basis from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  'parent',
  'the basis records that it came from a parent, not that a box was ticked'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_granted_by from studeasy.profiles
   where id = current_setting('t.child')::uuid),
  current_setting('t.mum')::uuid,
  'and names which one'
) || chr(10), true);

reset role;
select tests.authenticate_as(current_setting('t.child')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || lives_ok(
  $t$ insert into studeasy.attempts (assessment_id, student_id)
      values (current_setting('t.paper')::uuid,
              current_setting('t.child')::uuid) $t$,
  'the child can now sit the paper'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Withdrawal, and the stale-consent seam: unlinking has to take it with it.
-- ---------------------------------------------------------------------------

reset role;
select tests.authenticate_as(current_setting('t.mum')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || lives_ok(
  $t$ select studeasy.unlink_student(current_setting('t.child')::uuid) $t$,
  'the parent removes the link'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  studeasy.consent_pending(current_setting('t.child')::uuid),
  'which re-gates the child — a consent from an absent guardian is not one'
) || chr(10), true);

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

/*
 * One row per line, not one cell containing all of them.
 *
 * string_agg put every failure into a single cell, which the SQL editor shows
 * collapsed — so a failing run was readable only as its last line, the "Looks
 * like you failed N tests" summary, and the descriptions of WHICH assertions
 * failed never made it out of the grid. Rows are legible and copyable.
 *
 * The union arm exists because finish() emits nothing at all on success, and
 * an empty result reads as a broken run rather than a passing one.
 */
/*
 * `as materialized` matters: the log has to be read BEFORE finish() is called,
 * and without it the planner is free to interleave the two.
 */
with detail as materialized (
  select line
  from regexp_split_to_table(
         coalesce(current_setting('t.log', true), ''), chr(10)
       ) as t(line)
  where line like 'not ok%'
)
select line as tap_result from detail
union all
select line from finish() as t(line)
union all
select 'PASS - every assertion in this file succeeded.'
where not exists (select 1 from detail);

rollback;
