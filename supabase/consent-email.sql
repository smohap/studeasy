--
-- consent-email.sql — a parent with no account can still consent.
--
-- Run AFTER supabase/consent.sql. Safe to re-run.
--
-- consent.sql's gate is unchanged: consent_basis is null blocks a child's
-- record from starting. What changes is how that column gets set.
--
-- The route it already had needed a LINKED parent, and linking requires the
-- STUDENT to approve the request — so the child had to stay signed in to admit
-- their own guardian. That is incompatible with "registration is not complete
-- until a parent acts", and it is the reason this file exists.
--
-- What this does NOT claim: the address is the whole security boundary.
-- Whoever receives the link can consent, and a child can type a friend's
-- address. That is the same class of weakness as the self-declared date of
-- birth, and it is what every comparable service relies on — but it is a
-- deterrent rather than a proof, and nothing in the UI should imply otherwise.
--
-- Needs pgcrypto for digest(). Supabase enables it in the extensions schema.

do $$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception
      'pgcrypto is not available: create extension pgcrypto with schema extensions;';
  end if;
end
$$;

alter table studeasy.profiles
  add column if not exists consent_granted_via text,
  add column if not exists consent_email_last_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_consent_via_check'
  ) then
    alter table studeasy.profiles
      add constraint profiles_consent_via_check
      check (consent_granted_via in ('portal', 'email'));
  end if;
end
$$;

create table if not exists studeasy.consent_invitations (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references studeasy.profiles (id) on delete cascade,
  parent_email text not null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists consent_invitations_student_idx
  on studeasy.consent_invitations (student_id, created_at desc);

/*
 * RLS on, and NO policies — exactly as admin_allowlist is done.
 *
 * A student must not be able to read their own token_hash, and a listing of
 * pending invitations is a listing of children's home addresses. Everything
 * reaches this table through the SECURITY DEFINER functions below.
 */
alter table studeasy.consent_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- Freezing the two new columns
--
-- guard_consent() in consent.sql only pins date_of_birth, consent_basis,
-- consent_granted_at and consent_granted_by — it was written before these two
-- columns existed. consent.sql does pick up two small edits of its own for
-- this work (grant_parental_consent records the route; write_consent_audit
-- logs it), but guard_consent() itself stays untouched: modifying it risks
-- reverting on a re-run ordering nobody controls. Left alone, the two new
-- columns are ordinary columns on a row the owning student can update, which
-- would let a student either claim the parent route for themselves or clear
-- their own rate-limit cooldown by touching an unrelated field on their own
-- profile.
-- ---------------------------------------------------------------------------

create or replace function studeasy.guard_consent_email()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  authorised boolean :=
    coalesce(current_setting('studeasy.consent_write', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and not studeasy.is_admin() and not authorised then
    new.consent_granted_via   := old.consent_granted_via;
    new.consent_email_last_at := old.consent_email_last_at;
  end if;

  -- Withdrawn (or never granted) means no route to point at either. Runs
  -- unconditionally, after the freeze above, so it also cleans up a basis
  -- that guard_consent() just cleared on this same row.
  if new.consent_basis is null then
    new.consent_granted_via := null;
  end if;

  return new;
end;
$$;

/*
 * Named to sort after profiles_guard_consent, so Postgres — which fires
 * same-timing triggers in name order — runs this one second and it sees
 * whatever basis guard_consent() already settled on new.consent_basis.
 */
drop trigger if exists profiles_guard_consent_email on studeasy.profiles;
create trigger profiles_guard_consent_email
  before update on studeasy.profiles
  for each row execute function studeasy.guard_consent_email();

revoke all on function studeasy.guard_consent_email() from public, anon, authenticated;

/*
 * Mints nothing. The raw token is generated in Node — the application's secret
 * to create and put in an email — and this stores only its SHA-256.
 *
 * Returns a word rather than raising, because the caller has to tell a
 * thirteen-year-old what happened, and 'rate_limited' is not an error.
 */
create or replace function studeasy.issue_consent_invitation(
  student uuid,
  email text,
  raw_token text
)
returns text
language plpgsql
security definer
set search_path = studeasy, public, extensions
as $fn$
declare
  caller uuid := auth.uid();
  recent integer;
  last_at timestamptz;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;
  if caller <> student and not studeasy.is_admin() then
    raise exception 'You can only do this for your own account.';
  end if;

  /*
   * Node validates the address before it ever calls this (lib/consent-token.ts
   * isEmailish), so a caller reaching this check with a bad address is not the
   * UI working as designed — it is the UI being bypassed. Raising rather than
   * returning a word matches that: this is the one refusal in this function
   * that should never happen through the app, so it is not one of the four
   * words ('sent', 'not_required', 'parent_linked', 'rate_limited') the app
   * is written to expect back.
   */
  if not (
    lower(trim(email)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
    and length(trim(email)) <= 254
  ) then
    raise exception 'That does not look like an email address.';
  end if;

  -- Never email a parent about a child who needs no consent.
  if not studeasy.consent_pending(student) then
    return 'not_required';
  end if;

  /*
   * The emailed route is for a student with NO parent account. A student
   * with a linked parent is consented for from that parent's own portal —
   * and that parent can withdraw it there, which puts the student back to
   * pending. Without this check the child could then email a link to any
   * address and redeem it, undoing the withdrawal of the one parent this
   * system can actually identify. Checked before the rate limit, so a
   * refusal here costs the student none of their sends.
   */
  if exists (
    select 1 from studeasy.profiles p
    where p.id = student and p.parent_id is not null
  ) then
    return 'parent_linked';
  end if;

  select p.consent_email_last_at into last_at
  from studeasy.profiles p where p.id = student;

  select count(*) into recent
  from studeasy.consent_invitations i
  where i.student_id = student and i.created_at > now() - interval '24 hours';

  /*
   * One per five minutes, five per rolling 24 hours. Not five in total: a
   * lifetime cap leaves a child who spent them on typos permanently stuck
   * needing an administrator, which is a worse failure than a slow one.
   */
  if (last_at is not null and last_at > now() - interval '5 minutes')
     or recent >= 5 then
    return 'rate_limited';
  end if;

  -- Only the newest link works.
  update studeasy.consent_invitations
  set used_at = now()
  where student_id = student and used_at is null;

  insert into studeasy.consent_invitations
    (student_id, parent_email, token_hash, expires_at)
  values (
    student,
    lower(trim(email)),
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    now() + interval '14 days'
  );

  perform set_config('studeasy.consent_write', 'on', true);
  update studeasy.profiles set consent_email_last_at = now() where id = student;
  perform set_config('studeasy.consent_write', 'off', true);

  return 'sent';
end;
$fn$;

grant execute on function
  studeasy.issue_consent_invitation(uuid, text, text) to authenticated;

/*
 * Read-only, and granted to anon: the parent has no account.
 *
 * The page needs this because consenting on page load would be triggered by
 * any mail client that prefetches links. The URL describes; a POST decides.
 */
create or replace function studeasy.describe_consent_invitation(raw_token text)
returns table (student_name text, expired boolean, spent boolean)
language sql
stable
security definer
set search_path = studeasy, public, extensions
as $fn$
  select split_part(coalesce(p.full_name, 'your child'), ' ', 1),
         i.expires_at <= now(),
         i.used_at is not null
  from studeasy.consent_invitations i
  join studeasy.profiles p on p.id = i.student_id
  where i.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex');
$fn$;

/*
 * The act itself. Zero rows on a bad, expired or spent token — the route
 * renders one message for all three, because distinguishing them tells
 * somebody guessing which of their guesses was once real.
 */
create or replace function studeasy.redeem_consent_invitation(raw_token text)
returns table (student_name text)
language plpgsql
security definer
set search_path = studeasy, public, extensions
as $fn$
declare
  inv studeasy.consent_invitations%rowtype;
begin
  select * into inv
  from studeasy.consent_invitations
  where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and used_at is null
    and expires_at > now();

  if not found then
    return;
  end if;

  /*
   * A token for a student who is already cleared does nothing — checked
   * before marking it used or touching the profile, so a stale link cannot
   * consume itself on the way to being refused. Covers two shapes of stale:
   * a second, older link a parent double-clicks after the newer one already
   * redeemed (consent_pending is already false), and a link that reaches an
   * inbox after the parent withdrew or a portal grant superseded it. Either
   * way this token should not re-grant, and it should not be spent either —
   * it is simply not the thing that changed the account's state.
   */
  if not studeasy.consent_pending(inv.student_id) then
    return;
  end if;

  /*
   * Same rule as issue_consent_invitation(), enforced again at the point that
   * matters: the email route is for a student with no parent account. A link
   * issued before a parent linked (or before one withdrew) must not override
   * that parent — they consent, or decline to, from their own portal. Not
   * consumed: like the check above, this token is refused rather than spent.
   */
  if exists (
    select 1 from studeasy.profiles p
    where p.id = inv.student_id and p.parent_id is not null
  ) then
    return;
  end if;

  update studeasy.consent_invitations set used_at = now() where id = inv.id;

  perform set_config('studeasy.consent_write', 'on', true);
  update studeasy.profiles
  set consent_basis       = 'parent',
      consent_granted_at  = now(),
      consent_granted_via = 'email',
      /*
       * consent_granted_by stays null on this route. There is no parent
       * ACCOUNT to point at, and putting any id there would be a fabricated
       * actor in a consent record — the one thing such a record must never
       * contain.
       */
      consent_granted_by  = null,
      updated_at          = now()
  where id = inv.student_id;
  perform set_config('studeasy.consent_write', 'off', true);

  insert into studeasy.notifications
    (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, inv.student_id, 'consent_granted',
         'You can get started',
         /*
          * Not "your parent confirmed": this code knows only that someone
          * holding the emailed link pressed the button, not who they were.
          */
         'Your account has been confirmed by email — you can get started.',
         '/portal/student'
  from studeasy.profiles p
  where p.id = inv.student_id and p.organization_id is not null;

  return query
    select split_part(coalesce(p.full_name, 'your child'), ' ', 1)
    from studeasy.profiles p where p.id = inv.student_id;
end;
$fn$;

grant execute on function
  studeasy.describe_consent_invitation(text) to anon, authenticated;
grant execute on function
  studeasy.redeem_consent_invitation(text) to anon, authenticated;

/*
 * Consent arriving by ANY route kills every outstanding emailed link for that
 * student.
 *
 * redeem_consent_invitation() already refuses a token once the student is no
 * longer pending, but a link that has not been clicked yet is still sitting
 * in an inbox for up to 14 days. Without this, a parent who confirmed through
 * the portal and then withdrew would leave that old link able to silently
 * re-grant consent on a click — the exact stale-token failure this table
 * exists to avoid, just arriving from the other direction. Firing on every
 * route (portal, email, an administrator's correction) rather than only the
 * email one means a portal grant also retires an email invitation sent
 * earlier for the same student.
 */
create or replace function studeasy.expire_consent_invitations()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
begin
  update studeasy.consent_invitations
  set used_at = now()
  where student_id = new.id and used_at is null;
  return new;
end;
$fn$;

drop trigger if exists profiles_expire_consent_invitations on studeasy.profiles;
create trigger profiles_expire_consent_invitations
  after update on studeasy.profiles
  for each row
  when (old.consent_basis is null and new.consent_basis is not null)
  execute function studeasy.expire_consent_invitations();

revoke all on function studeasy.expire_consent_invitations()
  from public, anon, authenticated;

/*
 * The address the student's own holding screen shows them, so they can tell
 * whether they typed it right. Returns only the caller's own most recent
 * invitation — filtered on auth.uid(), not a parameter — because the address
 * itself is the thing consent-invitations' RLS-with-no-policies is protecting;
 * this function is a narrow, deliberate hole in that, and the address it
 * exposes is one the caller typed in themselves in the first place.
 */
create or replace function studeasy.my_consent_email()
returns text
language sql
stable
security definer
set search_path = studeasy, public
as $fn$
  select i.parent_email
  from studeasy.consent_invitations i
  where i.student_id = auth.uid()
  order by i.created_at desc
  limit 1;
$fn$;

grant execute on function studeasy.my_consent_email() to authenticated;

-- Verification. Last statement, so the SQL editor actually shows it.
select
  to_regclass('studeasy.consent_invitations') is not null as table_present,
  to_regprocedure('studeasy.redeem_consent_invitation(text)') is not null
    as redeem_present,
  to_regprocedure('studeasy.my_consent_email()') is not null
    as my_email_present,
  (select count(*) from pg_policies
    where schemaname = 'studeasy' and tablename = 'consent_invitations')
    as policies_expect_zero;
