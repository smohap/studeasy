# Parental Consent by Emailed Token — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the route by which an under-13 student's account is unblocked — from "a linked parent confirms in their portal" to "a parent receives a one-time link by email" — so the student can be signed out at registration without deadlocking.

**Architecture:** The gate is unchanged and stays exactly as merged: `consent_basis is null` blocks attempts, answers and coins. This adds a second, independent route to setting that column. A `consent_invitations` table holds SHA-256 hashes of tokens minted in Node; three `SECURITY DEFINER` functions issue, describe and redeem them; a public `/consent/[token]` route lets a parent with no account act. Registration collects the parent's address and signs the student out.

**Tech Stack:** Postgres 15 (Supabase), pgTAP, Next.js 16 App Router, React 19, TypeScript, Vitest, Resend over `fetch` (no new npm dependency).

**Spec:** `docs/superpowers/specs/2026-09-23-email-parental-consent-design.md`

## Global Constraints

- **The age of consent is 13**, defined once in `studeasy.consent_age()` and once in `CONSENT_AGE` (`lib/consent.ts`). Never inline the number.
- **Every migration is `create or replace` and must be idempotent.** New SQL goes in `supabase/consent-email.sql`; do not edit `supabase/consent.sql` except where Task 2 says so.
- **Any new migration must be appended to `supabase/migration-order.mjs`**, or `scripts/db.mjs apply` and `rerun-hazards.test.ts` both fail.
- **A transaction-local flag authorises ONE write.** Every `set_config('studeasy.*', 'on', true)` is followed by `'off'` immediately after the statement it authorises. This has been a live defect twice in this schema.
- **`RESEND_API_KEY` is server-only.** Never `NEXT_PUBLIC_`. Never commit a key or paste one into a commit message. When absent, sending is skipped and the URL is logged; registration must still succeed.
- **The raw token exists only in the email.** The database stores `encode(digest(token,'sha256'),'hex')`; the redeem function takes the RAW token and hashes it internally.
- **Rate limit:** one send per five minutes, five per rolling 24 hours.
- **Token expiry:** 14 days.
- **pgTAP conventions** are enforced by `supabase/tests/conventions.test.ts`: `plan(N)` matches the assertion count; `reset role;` before every identity switch after the first; `auth.users` fixtures use `gen_random_uuid()`, never literals; clear `request.jwt.claims` before deleting fixtures; the verdict is the last statement returning rows; each assertion appends its line to `t.log`.
- **`npm test` passes** (`tsc --noEmit` and Vitest) at the end of every task.
- **No SQL can be executed here.** There is no Docker and no local Postgres, so every migration and pgTAP file is run by the operator pasting it into the Supabase editor. Write SQL so one paste yields maximum information.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/consent-token.ts` | Mint a token, hash it, mask an address, sanity-check an address |
| `lib/consent-token.test.ts` | Vitest for the above |
| `lib/email.ts` | The only file that knows Resend exists |
| `supabase/consent-email.sql` | Table, three functions, grants, verification select |
| `supabase/consent.sql` | *Modify:* `grant_parental_consent` records `consent_granted_via = 'portal'` |
| `supabase/migration-order.mjs` | *Modify:* append the new migration |
| `supabase/tests/consent-email_test.sql` | pgTAP: issue, redeem, expiry, reuse, rate limit, RLS |
| `app/consent/[token]/page.tsx` | Public confirmation page — no session required |
| `app/consent/[token]/ConsentForm.tsx` | Client component, one deliberate button |
| `app/consent/actions.ts` | `redeemConsent` server action |
| `app/auth/actions.ts` | *Modify:* carry parent email, issue, send, sign the student out |
| `app/register/RegisterWizard.tsx` | *Modify:* parent-email field when the date of birth is under 13 |
| `app/portal/student/ConsentWaiting.tsx` | *Modify:* masked address, resend, correct the address |
| `app/portal/student/consent-actions.ts` | `resendConsentEmail`, `changeParentEmail` |
| `docs/deploy-consent-email.md` | Operator runbook |

---

### Task 1: Token minting, hashing and address masking

Pure functions first, so the SQL and the UI both build against something settled.

**Files:**
- Create: `lib/consent-token.ts`
- Test: `lib/consent-token.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mintToken(): string` — 43-character base64url from 32 random bytes
  - `hashToken(raw: string): string` — lowercase hex SHA-256
  - `maskEmail(address: string): string`
  - `isEmailish(value: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { hashToken, isEmailish, maskEmail, mintToken } from './consent-token'

describe('mintToken', () => {
  it('is url-safe and long enough to be unguessable', () => {
    expect(mintToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintToken()))
    expect(seen.size).toBe(200)
  })
})

describe('hashToken', () => {
  it('is stable, lower-case hex, 64 characters', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches the SHA-256 Postgres produces', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('maskEmail', () => {
  it('shows enough to recognise and not enough to read', () => {
    expect(maskEmail('aroha.ngata@example.com')).toBe('a*********a@example.com')
    expect(maskEmail('jo@example.com')).toBe('j*o@example.com')
  })

  it('does not fall over on something that is not an address', () => {
    expect(maskEmail('nonsense')).toBe('nonsense')
  })
})

describe('isEmailish', () => {
  it('accepts an ordinary address and rejects obvious rubbish', () => {
    expect(isEmailish('mum@example.co.nz')).toBe(true)
    expect(isEmailish('mum@example')).toBe(false)
    expect(isEmailish('no-at-sign.com')).toBe(false)
    expect(isEmailish('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/consent-token.test.ts`
Expected: FAIL — cannot resolve `./consent-token`.

- [ ] **Step 3: Implement**

```ts
import { createHash, randomBytes } from 'node:crypto'

/**
 * The secret that goes in the email. 32 bytes of CSPRNG output, base64url so
 * it survives a URL and a double-click without escaping.
 *
 * Minted here rather than in Postgres: this is the application's secret to
 * generate and send, and the database should only ever see its hash.
 */
export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * What the database stores.
 *
 * Must stay byte-identical to Postgres's encode(digest(token,'sha256'),'hex'),
 * because redeem_consent_invitation() hashes the raw token it is handed and
 * compares. The test pins a known vector rather than round-tripping against
 * ourselves: a drift here means no token ever redeems, and nothing else in the
 * system would say why.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * Enough of an address to recognise your own, not enough to read a stranger's.
 *
 * The holding screen shows this to a child who may be on a shared or classroom
 * screen, so the local part keeps only its first and last character.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 1) return address

  const local = address.slice(0, at)
  const domain = address.slice(at)
  if (local.length <= 2) return `${local[0]}*${local.slice(1)}${domain}`

  return `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}${domain}`
}

/**
 * Deliberately loose. Whether an address is valid is decided by whether the
 * mail arrives, not by a regex, and strict patterns reject real addresses.
 * This only catches what is obviously not one.
 */
export function isEmailish(value: string): boolean {
  const v = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/consent-token.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/consent-token.ts lib/consent-token.test.ts
git commit -m "Mint the token in Node, store only its hash"
```

---

### Task 2: The invitation table and its three functions

**Files:**
- Create: `supabase/consent-email.sql`
- Modify: `supabase/consent.sql` — `grant_parental_consent` records the route
- Modify: `supabase/migration-order.mjs` — append `'consent-email.sql'`

**Interfaces:**
- Consumes: `studeasy.consent_pending(uuid)`, `studeasy.profiles.consent_basis` (from the merged `consent.sql`).
- Produces:
  - `studeasy.issue_consent_invitation(student uuid, email text, raw_token text) returns text` — `'sent'`, `'not_required'` or `'rate_limited'`
  - `studeasy.describe_consent_invitation(raw_token text) returns table(student_name text, expired boolean, spent boolean)`
  - `studeasy.redeem_consent_invitation(raw_token text) returns table(student_name text)` — zero rows on any failure
  - `studeasy.profiles.consent_granted_via text` — `'portal'` or `'email'`

- [ ] **Step 1: Write the table and its guard**

Create `supabase/consent-email.sql`, opening with a header in the style of the existing migrations: what it does, what it runs after, and what it does **not** claim.

```sql
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
```

- [ ] **Step 2: Add the issue function**

```sql
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

  -- Never email a parent about a child who needs no consent.
  if not studeasy.consent_pending(student) then
    return 'not_required';
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
```

- [ ] **Step 3: Add describe and redeem**

```sql
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

  update studeasy.consent_invitations set used_at = now() where id = inv.id;

  perform set_config('studeasy.consent_write', 'on', true);
  update studeasy.profiles
  set consent_basis       = 'parent',
      consent_granted_at  = now(),
      consent_granted_via = 'email',
      updated_at          = now()
  where id = inv.student_id;
  perform set_config('studeasy.consent_write', 'off', true);

  /*
   * consent_granted_by stays null on this route. There is no parent ACCOUNT to
   * point at, and putting any id there would be a fabricated actor in a
   * consent record — the one thing such a record must never contain.
   */

  insert into studeasy.notifications
    (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, inv.student_id, 'consent_granted',
         'You can get started',
         'Your parent or caregiver has confirmed your account.',
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

-- Verification. Last statement, so the SQL editor actually shows it.
select
  to_regclass('studeasy.consent_invitations') is not null as table_present,
  to_regprocedure('studeasy.redeem_consent_invitation(text)') is not null
    as redeem_present,
  (select count(*) from pg_policies
    where schemaname = 'studeasy' and tablename = 'consent_invitations')
    as policies_expect_zero;
```

- [ ] **Step 4: Record the route on the portal path**

In `supabase/consent.sql`, inside `grant_parental_consent`, add `consent_granted_via = 'portal',` to the `update ... set` list. Without it the column is null on that route and the two become indistinguishable in the audit log, which is the only reason the column exists.

- [ ] **Step 5: Append to the migration order**

In `supabase/migration-order.mjs`, add `'consent-email.sql',` as the final entry.

- [ ] **Step 6: Run the static checks**

Run: `npm test`
Expected: PASS. If `rerun-hazards.test.ts` fails, `consent-email.sql` redefines a function another migration also defines — update both its `KNOWN` map and the runbook.

- [ ] **Step 7: Commit**

```bash
git add supabase/consent-email.sql supabase/consent.sql supabase/migration-order.mjs
git commit -m "A parent with no account can consent by emailed token"
```

---

### Task 3: pgTAP coverage for the invitation lifecycle

**Files:**
- Create: `supabase/tests/consent-email_test.sql`

**Interfaces:**
- Consumes: everything Task 2 produces.
- Produces: nothing.

Follow `supabase/tests/consent_test.sql` exactly for structure — it is the file the conventions lint was written against: random ids in `t.*` settings, every assertion wrapped in `set_config('t.log', ...)`, `reset role;` before each identity switch after the first, claims cleared before the cleanup delete, verdict last.

- [ ] **Step 1: Write the test file**

Fixtures: one student of 10 (gated) and one of 14 (clear), built exactly as `consent_test.sql` builds them. Capture a raw token with `select set_config('t.token', gen_random_uuid()::text, true);` — any opaque string works, since the function only hashes what it is handed.

Twelve assertions:

1. `has_table('studeasy', 'consent_invitations', ...)`
2. `has_function('studeasy', 'redeem_consent_invitation', ...)`
3. issuing for the gated student returns `'sent'`
4. issuing again immediately returns `'rate_limited'` — the five-minute cooldown
5. issuing for the 14-year-old returns `'not_required'` — never email about a child who needs none
6. `describe_consent_invitation` returns the child's first name, not expired, not spent
7. as `authenticated`, `select count(*) from studeasy.consent_invitations` is 0 — RLS with no policies
8. redeeming returns one row
9. `consent_basis` is `'parent'`
10. `consent_granted_via` is `'email'`
11. `consent_granted_by` is null — no account to name, and inventing one falsifies the record
12. redeeming the same token a second time returns zero rows

Assertion 7 is the only one whose value depends on the caller: `reset role;`, `authenticate_as` the student, read the count, then `reset role;` again for the rest.

- [ ] **Step 2: Run the conventions lint**

Run: `npm test`
Expected: PASS, with `plan(12)` matching 12 assertions.

- [ ] **Step 3: Hand the SQL to the operator**

There is no local database. Ask for `supabase/consent-email.sql` then `supabase/tests/consent-email_test.sql` to be run, and for the result. **Do not mark this task complete until 12 assertions pass.**

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/consent-email_test.sql
git commit -m "Prove a token redeems once, and never twice"
```

---

### Task 4: Sending the email

**Files:**
- Create: `lib/email.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sendConsentEmail(input: { to: string; studentName: string; url: string }): Promise<{ sent: boolean; reason?: string }>`

- [ ] **Step 1: Implement**

Everything Resend-specific lives here and nowhere else, so changing provider is one file. No SDK — a `fetch` to `https://api.resend.com/emails`, which is why this adds no npm dependency.

The behaviour that matters, and the reason for it: **when `RESEND_API_KEY` is absent, log the URL and return `{ sent: false, reason: 'no-key' }`. Do not throw.** A missing key must not fail registration, or the platform is unusable locally and on any preview deployment nobody has configured. Mark the log line explicitly as a development affordance.

The body says plainly what is being agreed to — that a record of the child's work will be kept and shown to them and their tutors — in the words of what will happen, not the words of a privacy policy.

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "One file knows Resend exists"
```

---

### Task 5: Registration collects the address and signs the student out

**Files:**
- Modify: `app/auth/actions.ts`
- Modify: `app/register/RegisterWizard.tsx`

**Interfaces:**
- Consumes: `mintToken`, `isEmailish`, `maskEmail` (Task 1); `sendConsentEmail` (Task 4); `issue_consent_invitation` (Task 2); `needsGuardianConsent`, `CONSENT_AGE` (`lib/consent.ts`).
- Produces: `RegistrationDetails.parentEmail?: string`.

- [ ] **Step 1: Extend the wizard**

A parent-email field on step 3, rendered only when `needsGuardianConsent(dateOfBirth)` — so it appears live as the date is typed, and an older student never sees it. Required when shown, checked with `isEmailish`. The existing under-age notice gains a line naming who will be emailed.

- [ ] **Step 2: Extend the server action**

`validate()` requires `parentEmail` when the date of birth is under age, re-derived from the date server-side and never from whether the client sent the field.

After the account is created: mint a token, call `issue_consent_invitation`, call `sendConsentEmail` with `${siteUrl}/consent/${token}`, then **sign the student out**. Same for `completeProfile` on the Google route.

A failure to send must not fail registration — the account exists and is held either way, and the holding screen offers a resend.

- [ ] **Step 3: Update the done screen**

It currently tells an under-age student to sign in. It must instead name the masked address and say what happens next.

- [ ] **Step 4: Verify in the browser**

Start the preview, walk registration as a 10-year-old, and confirm: the field appears as the date crosses the threshold, is absent for a 14-year-old, and the confirmation screen names the masked address. Screenshot it.

- [ ] **Step 5: Commit**

```bash
git add app/auth/actions.ts app/register/RegisterWizard.tsx
git commit -m "Registration ends with an email to a parent, not a session"
```

---

### Task 6: The public consent page

**Files:**
- Create: `app/consent/[token]/page.tsx`, `app/consent/[token]/ConsentForm.tsx`, `app/consent/actions.ts`

**Interfaces:**
- Consumes: `describe_consent_invitation`, `redeem_consent_invitation` (Task 2).
- Produces: nothing.

- [ ] **Step 1: The page**

A server component calling `describe_consent_invitation`. No session required. It renders the child's first name and a plain-English statement of what is being agreed to.

One message covers bad, expired and spent tokens: *"This link is no longer valid."* Distinguishing them tells someone guessing which guess was once real. The expired case adds that the student can send a new one from their own account.

`export const metadata = { robots: { index: false } }` — a consent URL must never be indexed.

- [ ] **Step 2: The form**

A client component with one button. **No pre-ticked box, no auto-submit, and consent requires a POST** — a GET on the token URL must do nothing, because mail scanners follow links.

- [ ] **Step 3: Verify in the browser**

Visit `/consent/obviously-not-a-real-token` and confirm the single refusal message renders without an error.

- [ ] **Step 4: Commit**

```bash
git add app/consent
git commit -m "A parent consents without an account"
```

---

### Task 7: The holding screen, simplified

**Files:**
- Modify: `app/portal/student/ConsentWaiting.tsx`
- Create: `app/portal/student/consent-actions.ts`

**Interfaces:**
- Consumes: `maskEmail`, `mintToken`, `isEmailish` (Task 1); `issue_consent_invitation` (Task 2); `sendConsentEmail` (Task 4).
- Produces: `resendConsentEmail()`, `changeParentEmail(email: string)`.

- [ ] **Step 1: Simplify the screen**

The Student ID block and the link-request panel come out — neither is how consent arrives now. What replaces them: the masked address, a resend button, and a way to correct the address.

Rate-limit feedback must be honest: `'rate_limited'` says when they can try again, not "something went wrong".

- [ ] **Step 2: The actions**

`changeParentEmail` issues a fresh invitation, which invalidates the outstanding one. A student changing the address can point it anywhere — that adds no weakness, since they chose the first one too — but say so in a comment rather than leaving it to be rediscovered.

- [ ] **Step 3: Verify in the browser**

Render the holding screen with the dev stub set to a gated student, as was done for the merged version. Confirm the masked address shows and the resend button is present. **Revert the stub afterwards.**

- [ ] **Step 4: Commit**

```bash
git add app/portal/student
git commit -m "The waiting screen says who was emailed, and can try again"
```

---

### Task 8: Runbook and README

**Files:**
- Create: `docs/deploy-consent-email.md`
- Modify: `README.md`

- [ ] **Step 1: Write the runbook**

Order (`consent.sql`, then `consent-email.sql`), the pgcrypto prerequisite, and the `RESEND_API_KEY` step — **stated as the operator's to place, in `.env.local` and Vercel, never handled here** — plus what happens when it is absent.

State plainly, as the spec does, that the address is the whole security boundary and that nothing here proves parenthood.

Include the re-run rule and `node scripts/db.mjs after consent-email.sql`.

- [ ] **Step 2: Update the README gaps section**

The consent entry must describe the email route rather than the portal one.

- [ ] **Step 3: Commit and open the PR**

```bash
git add docs/deploy-consent-email.md README.md
git commit -m "How to deploy the email consent route"
```

The PR description states which parts are verified and which are not — in particular whether the SQL has been executed, and whether an email has actually been sent and received.

---

## Self-Review

**Spec coverage.** Table and columns → Task 2. Three functions → Task 2. Hashing → Tasks 1 and 2. Rate limit → Task 2, asserted in Task 3. Expiry → Task 2, asserted in Task 3. Registration and sign-out → Task 5. Public route → Task 6. Holding screen → Task 7. Email provider → Task 4. Tests → Tasks 1 and 3, plus browser checks in 5–7. Runbook → Task 8. Two spec items are deliberately **out of scope and stay so**: free sessions, and expiring an account whose parent never responds.

**Type consistency.** `issue_consent_invitation` returns `text` (`'sent'` / `'not_required'` / `'rate_limited'`) in Tasks 2, 5 and 7. `redeem_consent_invitation` returns `table(student_name text)` in Tasks 2, 3 and 6. `hashToken` is lowercase hex in Tasks 1 and 2.

**Known gap.** Task 3 cannot be finished here — there is no database. It ends in a handoff, and is not complete until the operator reports twelve passing assertions.
