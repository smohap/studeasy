--
-- consent-email_test.sql — the invitation lifecycle: issue, cooldown, expiry,
-- reissue, the write guard, and a token that redeems exactly once. Also the
-- edges around it: the consent.sql backfill leaving a gated student alone, a
-- linked parent's child being refused the email route, a token for a student
-- who is already cleared, and consent by another route killing a live link.
--
-- Run supabase/tests/helpers.sql once first, then supabase/consent.sql, then
-- supabase/consent-email.sql, then this file on its own.
--
-- Structure copied from supabase/tests/consent_test.sql: random ids in `t.*`
-- settings, every assertion appended to `t.log` via set_config so the
-- Supabase editor's last-result-only view does not swallow it, `reset role;`
-- before every identity switch after the first, claims cleared before the
-- cleanup delete, verdict as the last statement.
--
-- Every redeem runs as `anon` with no jwt claims, because that is what the
-- real /consent/<token> route is: a parent with no account. Anything read
-- back afterwards is read as the owner — `anon` can see no profile row, and
-- an assertion that depends on that would be testing RLS by accident.
--

begin;
set local search_path = pg_temp, extensions, studeasy, public;

select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures. Above the first authenticate_as: these rows are refused by RLS
-- once a non-owner role is in force.
-- ---------------------------------------------------------------------------

select set_config('t.gated',  gen_random_uuid()::text, true);
select set_config('t.clear',  gen_random_uuid()::text, true);
select set_config('t.linked', gen_random_uuid()::text, true);
select set_config('t.late',   gen_random_uuid()::text, true);
select set_config('t.mum',    gen_random_uuid()::text, true);

/*
 * A student of ten (gated) and one of fourteen (clear of the gate outright).
 * Two more of ten: `linked`, who has a parent account attached, and `late`,
 * whose consent arrives by a route other than the email. And the parent
 * account `linked` is attached to.
 */
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('t.gated')::uuid,
   'gated-' || current_setting('t.gated') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Gated Student',
                      'date_of_birth', (current_date - interval '10 years')::date::text)),
  (current_setting('t.clear')::uuid,
   'clear-' || current_setting('t.clear') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Clear Student',
                      'date_of_birth', (current_date - interval '14 years')::date::text)),
  (current_setting('t.linked')::uuid,
   'linked-' || current_setting('t.linked') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Linked Student',
                      'date_of_birth', (current_date - interval '10 years')::date::text)),
  (current_setting('t.late')::uuid,
   'late-' || current_setting('t.late') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Late Student',
                      'date_of_birth', (current_date - interval '10 years')::date::text)),
  (current_setting('t.mum')::uuid,
   'mum-' || current_setting('t.mum') || '@test.invalid',
   jsonb_build_object('role', 'parent', 'full_name', 'Linked Parent'));

/*
 * Linking `linked` to `mum`. consent_test.sql does this the long way —
 * request_student_link() as the parent, respond_to_link_request() as the
 * student — because the link flow is what it is testing. Here the link is
 * only a precondition, so the owner writes parent_id directly, raising the
 * same transaction-local flag respond_to_link_request() raises for
 * guard_profile(), and closing it after the one write it authorises.
 */
select set_config('studeasy.link_approved', 'on', true);
update studeasy.profiles set parent_id = current_setting('t.mum')::uuid
where id = current_setting('t.linked')::uuid;
select set_config('studeasy.link_approved', 'off', true);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

select set_config('t.log', coalesce(current_setting('t.log', true), '') || has_table(
  'studeasy', 'consent_invitations', 'consent_invitations table exists'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || has_function(
  'studeasy', 'redeem_consent_invitation', 'redeem_consent_invitation() exists'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- The consent.sql backfill must not un-gate a student the gate is holding.
--
-- consent.sql is re-run on a live database by this branch, and its backfill
-- marks students 'legacy'. This runs that UPDATE — copied verbatim from the
-- backfill, with one extra `p.id = ...` so it cannot touch anything but this
-- fixture — against the gated ten-year-old, under the same flag, and checks
-- the basis is still null.
--
-- What this proves: the predicate AS COPIED HERE excludes a gated student,
-- and the rest of that predicate on its own would have matched them (the
-- first half of the ok() below), so it is the date-of-birth condition doing
-- the work. What it does not prove: that consent.sql still contains this
-- predicate. A test cannot import a statement out of a DO block; if the two
-- drift, only reading them side by side will catch it.
-- ---------------------------------------------------------------------------

select set_config('studeasy.consent_write', 'on', true);
update studeasy.profiles p
set consent_basis = 'legacy'
where p.consent_basis is null
  and p.date_of_birth is null
  and (
    p.role = 'student'
    or exists (
      select 1 from studeasy.profile_roles r
      where r.profile_id = p.id and r.role = 'student'
    )
  )
  and p.id = current_setting('t.gated')::uuid;
select set_config('studeasy.consent_write', 'off', true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  (select count(*) from studeasy.profiles p
   where p.consent_basis is null
     and (
       p.role = 'student'
       or exists (
         select 1 from studeasy.profile_roles r
         where r.profile_id = p.id and r.role = 'student'
       )
     )
     and p.id = current_setting('t.gated')::uuid) = 1
  and (select consent_basis is null from studeasy.profiles
       where id = current_setting('t.gated')::uuid),
  'the consent.sql backfill leaves a gated student (has a date of birth) gated'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Issuing: sent, then rate-limited, then unneeded for the older student,
-- then refused for a student whose parent has an account
-- ---------------------------------------------------------------------------

select set_config('t.tokenA', gen_random_uuid()::text, true);
select tests.authenticate_as(current_setting('t.gated')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  studeasy.issue_consent_invitation(current_setting('t.gated')::uuid,
    'parent-a-' || current_setting('t.gated') || '@test.invalid',
    current_setting('t.tokenA')),
  'sent',
  'issuing for the gated ten-year-old sends an invitation'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  studeasy.issue_consent_invitation(current_setting('t.gated')::uuid,
    'parent-a2-' || current_setting('t.gated') || '@test.invalid',
    gen_random_uuid()::text),
  'rate_limited',
  'issuing again immediately hits the five-minute cooldown'
) || chr(10), true);

reset role;
select tests.authenticate_as(current_setting('t.clear')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  studeasy.issue_consent_invitation(current_setting('t.clear')::uuid,
    'parent-c-' || current_setting('t.clear') || '@test.invalid',
    gen_random_uuid()::text),
  'not_required',
  'the fourteen-year-old needs no invitation at all'
) || chr(10), true);

reset role;
select tests.authenticate_as(current_setting('t.linked')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  studeasy.issue_consent_invitation(current_setting('t.linked')::uuid,
    'parent-l-' || current_setting('t.linked') || '@test.invalid',
    gen_random_uuid()::text),
  'parent_linked',
  'a gated student with a linked parent is refused the email route'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- What the token describes, and what RLS hides
-- ---------------------------------------------------------------------------

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  (select student_name = 'Gated' and not expired and not spent
   from studeasy.describe_consent_invitation(current_setting('t.tokenA'))),
  'describe shows the child''s first name, live and unspent'
) || chr(10), true);

reset role;
select tests.authenticate_as(current_setting('t.gated')::uuid);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || throws_ok(
  $$select count(*) from studeasy.consent_invitations$$,
  '42501',
  null,
  'an authenticated student cannot read consent_invitations at all'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- An expired token redeems nothing, and the student stays pending
-- ---------------------------------------------------------------------------

reset role;

update studeasy.consent_invitations
set expires_at = now() - interval '1 minute'
where token_hash = encode(extensions.digest(current_setting('t.tokenA'), 'sha256'), 'hex');

/*
 * From here every redeem is anonymous: role anon, and no claims, so
 * auth.uid() is null exactly as it is for a parent with no account.
 */
reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenA'))),
  0::bigint,
  'an expired token redeems nothing'
) || chr(10), true);

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  studeasy.consent_pending(current_setting('t.gated')::uuid),
  'and the student is still pending'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Issuing again invalidates the earlier token. Each cooldown-clearing update
-- is wrapped in the flag the guard trigger requires — the test superuser
-- satisfies neither is_admin() (no jwt claims, auth.uid() is null) nor the
-- flag on its own.
-- ---------------------------------------------------------------------------

select set_config('t.tokenB', gen_random_uuid()::text, true);
select set_config('t.tokenC', gen_random_uuid()::text, true);

select set_config('studeasy.consent_write', 'on', true);
update studeasy.profiles set consent_email_last_at = null
where id = current_setting('t.gated')::uuid;
select set_config('studeasy.consent_write', 'off', true);

reset role;
select tests.authenticate_as(current_setting('t.gated')::uuid);

select studeasy.issue_consent_invitation(current_setting('t.gated')::uuid,
  'parent-b-' || current_setting('t.gated') || '@test.invalid',
  current_setting('t.tokenB'));

reset role;

select set_config('studeasy.consent_write', 'on', true);
update studeasy.profiles set consent_email_last_at = null
where id = current_setting('t.gated')::uuid;
select set_config('studeasy.consent_write', 'off', true);

reset role;
select tests.authenticate_as(current_setting('t.gated')::uuid);

select studeasy.issue_consent_invitation(current_setting('t.gated')::uuid,
  'parent-c-' || current_setting('t.gated') || '@test.invalid',
  current_setting('t.tokenC'));

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  (select spent from studeasy.describe_consent_invitation(current_setting('t.tokenB'))),
  'issuing a new token invalidates the one before it — only the newest works'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- The write guard: a student cannot touch the two frozen columns on their
-- own profile, whether or not an invitation is in flight.
-- ---------------------------------------------------------------------------

select set_config('t.snap_last',
  (select consent_email_last_at::text from studeasy.profiles
   where id = current_setting('t.gated')::uuid), true);

reset role;
select tests.authenticate_as(current_setting('t.gated')::uuid);

update studeasy.profiles
set consent_granted_via   = 'portal',
    consent_email_last_at = now() + interval '1 day'
where id = current_setting('t.gated')::uuid;

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  (select consent_granted_via is null
     and consent_email_last_at::text = current_setting('t.snap_last')
   from studeasy.profiles where id = current_setting('t.gated')::uuid),
  'a student cannot write consent_granted_via or consent_email_last_at on their own profile'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- The successful redemption, on the still-live token, as anon
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenC'))),
  1::bigint,
  'redeeming the live token succeeds once'
) || chr(10), true);

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_basis from studeasy.profiles where id = current_setting('t.gated')::uuid),
  'parent',
  'redeeming grants consent with a parent basis'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_granted_via from studeasy.profiles where id = current_setting('t.gated')::uuid),
  'email',
  'and records that it arrived by the emailed route'
) || chr(10), true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select consent_granted_by from studeasy.profiles where id = current_setting('t.gated')::uuid),
  null::uuid,
  'and names no account, because there is no parent account to name'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- The same token cannot redeem twice
-- ---------------------------------------------------------------------------

reset role;
set local role anon;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenC'))),
  0::bigint,
  'redeeming the same token a second time returns nothing'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- A token for a student who is already cleared does nothing — and is not
-- spent by the attempt.
--
-- issue_consent_invitation() will not mint one for a cleared student (it
-- returns 'not_required'), and the AFTER trigger retires any that were live
-- when consent arrived. So the only way to get a live token for a cleared
-- student is to write one directly, as the owner — which is exactly the
-- belt-and-braces case redeem's own consent_pending() check is there for.
-- ---------------------------------------------------------------------------

reset role;

select set_config('t.tokenK', gen_random_uuid()::text, true);

insert into studeasy.consent_invitations
  (student_id, parent_email, token_hash, expires_at)
values (
  current_setting('t.clear')::uuid,
  'parent-k-' || current_setting('t.clear') || '@test.invalid',
  encode(extensions.digest(current_setting('t.tokenK'), 'sha256'), 'hex'),
  now() + interval '14 days'
);

reset role;
set local role anon;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenK'))),
  0::bigint,
  'a token for a student who is already cleared does nothing'
) || chr(10), true);

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  (select not spent from studeasy.describe_consent_invitation(current_setting('t.tokenK')))
  and (select consent_basis = 'not_required' from studeasy.profiles
       where id = current_setting('t.clear')::uuid),
  'and it is refused rather than spent, leaving the basis as it was'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- A linked parent's child cannot redeem around them either. Same shape of
-- fixture as above: issue refuses (asserted earlier), so the token is written
-- directly — standing in for a link issued before the parent linked.
-- ---------------------------------------------------------------------------

select set_config('t.tokenP', gen_random_uuid()::text, true);

insert into studeasy.consent_invitations
  (student_id, parent_email, token_hash, expires_at)
values (
  current_setting('t.linked')::uuid,
  'parent-p-' || current_setting('t.linked') || '@test.invalid',
  encode(extensions.digest(current_setting('t.tokenP'), 'sha256'), 'hex'),
  now() + interval '14 days'
);

reset role;
set local role anon;

select set_config('t.redeemP',
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenP')))::text,
  true);

reset role;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  current_setting('t.redeemP') = '0'
  and (select not spent from studeasy.describe_consent_invitation(current_setting('t.tokenP')))
  and studeasy.consent_pending(current_setting('t.linked')::uuid),
  'an emailed link does nothing for a student with a linked parent, and is not spent'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Consent by any other route kills a live emailed link: the AFTER trigger.
--
-- `late` issues a real invitation while pending, then the owner grants
-- consent directly under the flag — standing in for a portal grant or an
-- administrator's correction. The trigger has to have marked the link used.
-- ---------------------------------------------------------------------------

select set_config('t.tokenL', gen_random_uuid()::text, true);

reset role;
select tests.authenticate_as(current_setting('t.late')::uuid);

select studeasy.issue_consent_invitation(current_setting('t.late')::uuid,
  'parent-late-' || current_setting('t.late') || '@test.invalid',
  current_setting('t.tokenL'));

reset role;
select set_config('request.jwt.claims', null, true);

-- Captured before consent arrives, so the assertion shows the trigger moved it.
select set_config('t.late_spent_before',
  (select spent::text from studeasy.describe_consent_invitation(current_setting('t.tokenL'))),
  true);

select set_config('studeasy.consent_write', 'on', true);
update studeasy.profiles set consent_basis = 'parent', consent_granted_at = now()
where id = current_setting('t.late')::uuid;
select set_config('studeasy.consent_write', 'off', true);

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  current_setting('t.late_spent_before') = 'false'
  and (select spent from studeasy.describe_consent_invitation(current_setting('t.tokenL'))),
  'consent arriving by another route marks a live emailed link used'
) || chr(10), true);

reset role;
set local role anon;

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenL'))),
  0::bigint,
  'and that link then redeems nothing'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', null, true);

delete from auth.users where id in (
  current_setting('t.gated')::uuid,  current_setting('t.clear')::uuid,
  current_setting('t.linked')::uuid, current_setting('t.late')::uuid,
  current_setting('t.mum')::uuid
);

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
