--
-- consent-email_test.sql — the invitation lifecycle: issue, cooldown, expiry,
-- reissue, the write guard, and a token that redeems exactly once.
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

begin;
set local search_path = pg_temp, extensions, studeasy, public;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures. Above the first authenticate_as: these rows are refused by RLS
-- once a non-owner role is in force.
-- ---------------------------------------------------------------------------

select set_config('t.gated', gen_random_uuid()::text, true);
select set_config('t.clear', gen_random_uuid()::text, true);

-- A student of ten (gated) and one of fourteen (clear of the gate outright).
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('t.gated')::uuid,
   'gated-' || current_setting('t.gated') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Gated Student',
                      'date_of_birth', (current_date - interval '10 years')::date::text)),
  (current_setting('t.clear')::uuid,
   'clear-' || current_setting('t.clear') || '@test.invalid',
   jsonb_build_object('role', 'student', 'full_name', 'Clear Student',
                      'date_of_birth', (current_date - interval '14 years')::date::text));

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
-- Issuing: sent, then rate-limited, then unneeded for the older student
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

select set_config('t.log', coalesce(current_setting('t.log', true), '') || ok(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenA'))) = 0
  and studeasy.consent_pending(current_setting('t.gated')::uuid),
  'an expired token redeems nothing, and the student is still pending'
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
-- The successful redemption, on the still-live token
-- ---------------------------------------------------------------------------

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenC'))),
  1::bigint,
  'redeeming the live token succeeds once'
) || chr(10), true);

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

select set_config('t.log', coalesce(current_setting('t.log', true), '') || is(
  (select count(*) from studeasy.redeem_consent_invitation(current_setting('t.tokenC'))),
  0::bigint,
  'redeeming the same token a second time returns nothing'
) || chr(10), true);

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', null, true);

delete from auth.users where id in (
  current_setting('t.gated')::uuid, current_setting('t.clear')::uuid
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
