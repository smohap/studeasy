# Deploying parental consent by email

What this adds: a student under 13 can now be consented for by a parent who
has **no account at all** — a one-time emailed link — instead of only through
a linked parent's own portal. See
`docs/superpowers/specs/2026-09-23-email-parental-consent-design.md` for the
design. `docs/deploy-consent-gate.md` covers the original gate this sits on
top of; that document's re-run rule still applies to everything in it.

**Read `supabase/consent-email.sql` before running it.** The header explains
what the table is for and what it deliberately does not claim.

## Order: `consent.sql` again, then `consent-email.sql`, then the test file

This branch changes `supabase/consent.sql` itself — it is not "already done"
from the earlier gate. Two edits:

- `grant_parental_consent(student uuid)` now sets
  `consent_granted_via = 'portal'` on the profile it updates.
- `write_consent_audit()` now records `'via', to_jsonb(new)->>'consent_granted_via'`
  in the audit row.

Both edits reference `consent_granted_via`, a column that does not exist
until `consent-email.sql` adds it. `consent.sql` still defines fine on its
own — Postgres only resolves a PL/pgSQL function's column references the
first time it actually *runs*, not when it is defined — but
**`grant_parental_consent` fails at run time if it is called before
`consent-email.sql` has added the column.** Paste the two files back to back,
in this order, with nothing in between:

1. `supabase/consent.sql` (re-run, even though you ran it before this branch)
2. `supabase/consent-email.sql`
3. `supabase/tests/consent-email_test.sql`

Each file is idempotent and safe to re-run on its own. The three-file
sequence above is what has to run together.

**pgcrypto.** `consent-email.sql` needs `digest(text,text)` from pgcrypto,
which Supabase enables in the `extensions` schema by default. The file checks
for it at the top and fails with a readable message —
`pgcrypto is not available: create extension pgcrypto with schema extensions;`
— rather than a bare "function does not exist" further down.

**The re-run rule from `docs/deploy-consent-gate.md` still applies.** If you
re-run `consent.sql` on its own later, re-run `consent-email.sql` after it
too. Check what a re-run reverts with:

```
node scripts/db.mjs after consent-email.sql
```

At the time of writing this prints `Re-running consent-email.sql reverts
nothing. No further action.` — nothing after it in
`supabase/migration-order.mjs` redefines a function it defines. That can
change as more migrations are added after it; the command tells you the
truth at the time you run it, which is the point of asking it rather than
trusting this document.

## Run the tests

Paste `supabase/tests/consent-email_test.sql` (after `helpers.sql`, once,
if you have not already). It runs 15 assertions and, matching the other test
files in this project, the verdict — `PASS` or the failing `not ok` lines —
is the **last** result set, because that is the only one the Supabase SQL
editor shows you.

## `RESEND_API_KEY` and `RESEND_FROM` — the operator's to place, not handled here

`lib/email.ts` is the one file that knows Resend exists. It reads two
environment variables:

- **`RESEND_API_KEY`** — server-only. It must never be given a `NEXT_PUBLIC_`
  prefix, must never appear in a log, an error, or a commit, and is not
  something this runbook or any script sets for you. Create a Resend
  account, verify a sending domain, and put the key in `.env.local` for
  local work and in Vercel's project environment variables for anything
  deployed.
- **`RESEND_FROM`** — the sender address once a domain is verified. If it is
  unset, `lib/email.ts` falls back to Resend's own test sender,
  `StudEasy <onboarding@resend.dev>`, which **only delivers to the address
  on the Resend account itself** — useful for confirming the flow works
  end to end without setting up a domain, useless for anyone else actually
  receiving the email.

**What happens with no `RESEND_API_KEY` set** — a fresh checkout, or any
preview deployment nobody has wired up yet: `sendConsentEmail` does not
throw and registration does not fail. It logs the consent URL to the server
log under an explicit `[dev only]` marker and returns
`{ sent: false, reason: 'no-key' }`. The account is still created and still
held — the student lands on the waiting screen exactly as if the email had
gone out, and you can find the link by reading the server log instead of an
inbox.

## Email confirmation: this changes when the invitation is sent

If the Supabase project has **email confirmation required** turned on for
new sign-ups, `supabase.auth.signUp()` returns no session for a brand-new
account. `app/auth/actions.ts` uses exactly that to decide what to do: with
a session, it issues the invitation and sends the email immediately; with no
session, there is no `auth.uid()` yet to issue an invitation with, so
nothing is sent at registration. The student instead sees the "check your
email to confirm" state, confirms their own address, signs in, lands on the
holding screen (`app/portal/student/ConsentWaiting.tsx`), and presses
**"Send the email"** there — that is the first point the invitation actually
goes out.

Neither path is wrong; they are two different Supabase project settings.
Check which one you have: Supabase dashboard → Authentication → your email
provider settings → whether "Confirm email" is required. This runbook makes
no claim about which one your project is set to — check it, and expect the
registration flow you just tested to match.

## Admin: resetting the rate limit for one student

`issue_consent_invitation` refuses with `'rate_limited'` under two
independent conditions, both read from `supabase/consent-email.sql`:

- **Cooldown** — `profiles.consent_email_last_at` set within the last five
  minutes.
- **Daily cap** — five or more rows in `studeasy.consent_invitations` with
  `created_at` in the last 24 hours for that student. The count is
  `select count(*) ... where student_id = student and created_at > now() -
  interval '24 hours'` — it counts **every** row in that window, used or
  not, spent or live. There is no "unused-only" version of this check, so
  clearing the cap for a student who is stuck **requires deleting rows**,
  not just marking them used.

Both columns are behind `guard_consent_email()`, the same trigger pattern as
the original gate: a plain `update` from the SQL editor's `postgres` role is
neither the row's own student nor `studeasy.is_admin()`, so it is silently
reverted unless you raise `studeasy.consent_write` first. Identify the
student by their own login email — `studeasy.profiles.email` — and run this
as one transaction, ending in a `select` so the editor actually shows you
the result:

```sql
begin;

select set_config('studeasy.consent_write', 'on', true);

update studeasy.profiles
set consent_email_last_at = null
where email = 'the-students-own-login-email@example.com';

select set_config('studeasy.consent_write', 'off', true);

delete from studeasy.consent_invitations
where student_id = (
  select id from studeasy.profiles
  where email = 'the-students-own-login-email@example.com'
)
and created_at > now() - interval '24 hours';

select id, email, consent_email_last_at, consent_granted_via
from studeasy.profiles
where email = 'the-students-own-login-email@example.com';

commit;
```

**Deleting those rows discards their audit value.** Each row in
`consent_invitations` is the only record that an invitation to a particular
address was ever issued at a particular time — there is no separate audit
trail of sends the way `write_consent_audit()` gives you for consent grants.
Running the `delete` above for a student who is genuinely locked out is the
only way to reset the daily count, and it means you can no longer answer
"how many times, and to what addresses, did we email this family today" for
the rows you removed. Do it deliberately, for a student who actually needs
it, not as routine housekeeping.

## Honesty: what this proves and what it does not

**The email address is the entire security boundary.** Whoever receives the
link and presses the one button on `/consent/<token>` has granted consent.
Nothing in this system proves the address belongs to a parent, or to an
adult, or to anyone related to the student at all — a student can type any
address, including their own second account or a friend's, at registration
or later from the holding screen's "correct the address" affordance. Each
correction invalidates every link issued before it, so at most one address
is ever live at a time, but that is a property of *which* address can act,
not of *whether* the address belongs to a parent. This is the same class of
weakness as the self-declared, write-once date of birth the original gate
already relies on. Do not describe this to users, support scripts, or
anyone else as proof of parenthood — it is a deterrent, not a proof, and the
code and the design spec both say so deliberately rather than implying
otherwise.

## What is verified, and what is not

**Verified:** the SQL was read, and read again against this document,
matching every table, column, function name and environment variable name
mentioned here to what is actually in `supabase/consent-email.sql`,
`supabase/tests/consent-email_test.sql`, and `lib/email.ts`. `npm test`
passes on this branch.

**Not verified, because there is no database or mail account available
here:** none of the SQL above — `consent.sql`, `consent-email.sql`, the
15-assertion test file, or the admin reset query — has been executed
against a real Postgres database. No consent email has actually been sent
by Resend, and no one has clicked a real link in a real inbox. That is why
step 4 below exists, and it is the step that turns "this should work" into
"this worked."

## Before you merge: walk a real signup

Same requirement as the original gate, extended to the email itself. On the
preview deployment: register a new under-13 student, with `RESEND_API_KEY`
and `RESEND_FROM` set so the send is real, and confirm all of:

1. The parent-email field appears on the wizard once the entered date of
   birth crosses under the threshold, and the account is created.
2. Depending on the project's email-confirmation setting (see above), either
   the invitation email arrives directly, or the student confirms their own
   address, signs in, reaches the holding screen, and pressing "Send the
   email" is what makes it arrive.
3. The email actually lands in the parent's inbox — not just the server
   log — with a working `/consent/<token>` link.
4. Opening that link shows the child's first name and does **not** grant
   consent on page load (it should describe, not act, until the button is
   pressed — this is what stops a mail client's link-prefetcher from
   silently consenting on the parent's behalf).
5. Pressing the button on `/consent/<token>` grants consent, the student
   can sign in and reach the parts of the app the gate was blocking, and a
   second click on the same link does nothing.
