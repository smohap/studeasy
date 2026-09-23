# Parental consent by email token

**Date:** 23 September 2026
**Status:** Design, approved in conversation. Supersedes the consent route in
PR #5 (`feat/parental-consent-gate`), which is unmerged and will be amended
rather than stacked on.

## Why this exists, and why it changed

PR #5 built a gate: a student under 16 accumulates no learning record until a
parent confirms. The threshold, the date of birth, the write-once freeze and
the enforcement points are all correct and are **kept unchanged** by this
document.

What changed is the *route by which consent arrives*.

PR #5 required a **linked** parent — one the student had approved — and that
created a dependency worth spelling out, because it is the whole reason this
redesign exists:

1. Consent comes from a linked parent.
2. Linking requires the student to approve the parent's request.
   `supabase/family.sql` states this deliberately: *"A parent cannot attach
   themselves to an account unilaterally."*
3. Therefore the student must be able to sign in and act while held.

PR #5 solved that by leaving one door open: a held student could sign in and
approve a link request, and nothing else. That works, but it means the child is
the one who admits their own guardian — and the product decision is now that a
student's registration is **not complete** until a parent has acted.

An email token cuts the dependency. The parent's authority comes from
controlling the address, not from a code the child approved. The student never
needs to sign in, so they can be signed out at registration as intended, and
the `family.sql` safeguard stays intact because linking is no longer the
consent mechanism.

## Decisions

**The age threshold stays at 16.** Considered and rejected: holding every
student regardless of age. It would delete the date-of-birth logic entirely,
but an 18-year-old sitting scholarship exams cannot reasonably be made to
involve a parent, and losing adult learners is a worse outcome than keeping
one arithmetic function.

**Consent arrives by emailed one-time link.** Considered and rejected: letting
a parent link and consent unilaterally by quoting a Student ID. It needs no new
dependency, but it reverses `family.sql`'s explicit decision and makes anyone
holding a six-character code a guardian. Also rejected: keeping the student
signed in on a holding screen, which works but is not what "registration is not
complete" means.

**The link-based route is kept as well.** A parent who has registered, linked
and been approved can still consent from their own portal via the existing
`grant_parental_consent(uuid)`. Two routes, one outcome. The email covers the
common case where no parent account exists yet; the portal covers the parent
who is already here. Neither can be reached without the other's precondition,
so there is no ambiguity about which applies.

**Tokens are stored hashed, and the function takes the raw token.** SHA-256,
with the raw value existing only in the email. The function hashes its argument
and compares, so a database leak yields hashes that cannot be replayed. Passing
a hash to the function instead would have made the stored value sufficient to
grant consent, which defeats hashing it.

## What this is honest about

Two weaknesses, stated here so they are not discovered later as surprises. The
implementation documents both in the code rather than implying more.

**The email address is the entire security boundary.** Whoever receives the
link can consent. A 14-year-old can enter a friend's address, or their own
second account. Nothing here proves parenthood.

This is the same class of weakness as the self-declared date of birth already
in PR #5, and it is the model every comparable service uses. It is materially
stronger than a six-character Student ID — an address is a real-world identity
somebody controls, is typically an adult's, and leaves a delivery trail — but
it is a deterrent, not a proof. Claiming otherwise in the UI or the docs would
be worse than the weakness itself.

**A held student can redirect consent by changing the address.** The holding
screen lets a student correct a typo, which necessarily means they can change
it to anything. This adds no new weakness — they could have entered that
address in the first place — so it is allowed, rate-limited, and each change
invalidates every outstanding token for that student.

## Data model

One new table, in `supabase/consent-email.sql`.

```
studeasy.consent_invitations
  id             uuid pk
  student_id     uuid not null -> profiles(id) on delete cascade
  parent_email   text not null            -- stored lower(trim(...))
  token_hash     text not null unique     -- sha256 hex of the raw token
  expires_at     timestamptz not null     -- created_at + 14 days
  used_at        timestamptz              -- single use
  created_at     timestamptz not null default now()
```

Plus rate-limiting state on the student's profile rather than the invitation,
because the limit must survive invalidating a batch of tokens:

```
profiles.consent_emails_sent   integer not null default 0
profiles.consent_email_last_at timestamptz
```

And one column recording how consent arrived, so the audit row can distinguish
the two routes:

```
profiles.consent_granted_via   text check (in ('portal','email'))
```

`parent_email` is plain `text` normalised to lower case on the way in, not
`citext`: no other table here uses that extension and one column does not
justify adding it.

`consent_basis`, `consent_granted_at`, `consent_granted_by` and
`date_of_birth` are unchanged from PR #5. `consent_granted_by` stays null on
the email route — there is no parent *account* to point at, and inventing one
would put a fabricated actor in a consent record.

**RLS.** `consent_invitations` has row-level security on and **no policies at
all**, matching `admin_allowlist`: unreadable and unwritable through PostgREST.
Everything reaches it through `SECURITY DEFINER` functions. A student must not
be able to read their own `token_hash`, and a listing of pending invitations is
a listing of children's addresses.

## Functions

`studeasy.issue_consent_invitation(student uuid, email text) -> text`
SECURITY DEFINER. Callable by the student themselves or by an admin. The raw
token is generated in Node — Postgres is not the right place to mint a secret
the application has to put in an email — and this function receives it, stores
only its SHA-256, and returns nothing sensitive.

Refuses when: the student is not gated (`consent_pending` false — do not email
a parent about a child who needs no consent), the rate limit is hit (more than
one send in five minutes, or more than five sends in total), or the address
does not parse. Invalidates any outstanding invitations for that student before
inserting, so only the most recent link works.

`studeasy.redeem_consent_invitation(token text) -> table(student_name text)`
SECURITY DEFINER, granted to **anon** as well as authenticated — the parent has
no account and must not need one. Hashes the argument, finds a matching
invitation that is unused and unexpired, sets `consent_basis = 'parent'`,
`consent_granted_at = now()`, `consent_granted_via = 'email'`, marks the
invitation used, and returns the child's first name so the page can confirm who
was consented for.

Returns zero rows for a bad, expired or spent token. The route renders one
message for all three: distinguishing them tells someone guessing tokens which
of their guesses was once valid.

`studeasy.describe_consent_invitation(token text) -> table(student_name text, expired boolean)`
SECURITY DEFINER, anon. Read-only. Lets `/consent/[token]` show the child's
name and what is being agreed to *before* the parent presses the button,
because a page that consents on page load would be triggered by any email
client that prefetches links.

**pgcrypto.** `digest(text,'sha256')` comes from pgcrypto, which Supabase
enables in the `extensions` schema. The migration checks for it and fails with
a readable message rather than a missing-function error.

## Flows

**Registration, under-16 student.** The wizard asks for a parent or caregiver's
email alongside the date of birth, and only when the entered date is under 16 —
so the field appears live as they type, and an over-16 never sees it. Server
side the requirement is re-checked from the date, not from whether the client
sent the field.

On submit: the account is created as now, `issue_consent_invitation` is called,
the email is sent, and **the student is signed out**. They land on a screen that
names the address (partially masked) and says what happens next.

For the Google route the same applies at `/register/complete`, with the sign-out
at the end of `completeProfile`.

**The parent.** Receives an email with one link, `/consent/<token>`. The page is
public, shows the child's name and a plain-English statement of what is being
agreed to, and has one button. No account, no password, no sign-in.

**The student signing in before consent.** Allowed, and lands on the holding
screen. That screen is *simpler* than PR #5's: it no longer carries the
link-request UI, because approving a link is no longer how consent arrives. It
shows the masked address, a resend button, and a way to correct the address.

**After consent.** The student signs in normally. Everything PR #5 gates is
open, because the gate is still `consent_basis is null` and nothing else.

## Sending the email

The project has no mail sender. Resend is the choice: it is the usual one on
Vercel, has a small API, and needs no SDK beyond a `fetch` call — so this adds
**no npm dependency**, only an environment variable.

`lib/email.ts` wraps it behind one function, `sendConsentEmail({ to, studentName, url })`.
Everything Resend-specific lives in that file, so swapping provider is one file.

`RESEND_API_KEY` is **server-only** and must never carry a `NEXT_PUBLIC_`
prefix. **The key is the operator's to place** — in `.env.local` and in Vercel.
It is not handled here and must not be pasted into the repository, a commit
message, or a conversation.

**When the key is absent** — local development, a preview deployment, or before
the operator has set it up — sending is skipped and the consent URL is written
to the server log instead, with the account still created and still held. The
alternative, failing registration, would make the whole platform unusable
locally. The log line is explicitly marked as a development affordance.

## What changes in PR #5

Kept unchanged: `consent_pending`, the write-once freeze, the attempts and coin
gates, the audit trigger and the `legacy` backfill. `lib/consent.ts` and its
tests. The RLS and trigger work.

`supabase/consent.sql` needs one amendment, not none: `grant_parental_consent`
must set `consent_granted_via = 'portal'`, or the portal route leaves the column
null and the two routes stop being distinguishable in the audit log — which is
the only reason the column exists. Because `consent.sql` has already been run
against the database, this is a re-run of that file rather than a new one, and
it is idempotent by design.

Changed:

- `app/register/RegisterWizard.tsx` — a parent-email field, shown when the
  entered date of birth is under 16.
- `app/auth/actions.ts` — carry the address, issue the invitation, send the
  email, sign the student out.
- `app/portal/student/ConsentWaiting.tsx` — simplified: masked address, resend,
  correct-the-address. The Student ID block and the link-request panel come out,
  since neither is how consent arrives now.
- `app/portal/student/layout.tsx` — unchanged in shape; still the single place
  every student page is held.

Added: `supabase/consent-email.sql`, `supabase/tests/consent-email_test.sql`,
`lib/email.ts`, `app/consent/[token]/page.tsx`, `app/consent/actions.ts`.

## Testing

**pgTAP** (`consent-email_test.sql`), fixtures built the way
`consent_test.sql` now does it — random ids in transaction-local settings, never
fixed UUIDs:

- a token redeems once and sets `consent_basis = 'parent'`, via `'email'`
- the same token a second time does nothing and returns no rows
- an expired token does nothing
- a token for a student who is already cleared does nothing
- issuing twice invalidates the first token
- the rate limit refuses a second send inside five minutes
- `consent_invitations` is unreadable as `authenticated` — the student cannot
  read their own `token_hash`
- an ungated (over-16) student cannot have an invitation issued at all

**Vitest**: token generation length and alphabet, the hash is stable and lower
case hex, address masking, and the existing age boundary tests unchanged.

**Browser**: the wizard showing and hiding the parent-email field as the date
crosses the threshold; the holding screen; `/consent/<token>` in its valid,
expired and already-used states.

## What the operator does

1. Create a Resend account, verify a sending domain, and put `RESEND_API_KEY`
   in `.env.local` and in Vercel. Nobody else places this key.
2. Run `supabase/consent.sql` (already done), then `supabase/consent-email.sql`.
3. Run `supabase/tests/consent-email_test.sql` and read the verdict.
4. Walk a real under-16 signup on the preview deployment, end to end, including
   the email actually arriving.

## Out of scope

**Free diagnostic sessions** — publishing free sessions, listing them on the
home page, and admitting an unconsented student to a session list as
`pending_consent` — are a separate piece of work with their own spec, to be
done after this lands. The two meet at one point only: a held student joining a
session list is not confirmed until `consent_pending` turns false, and the
promotion happens on the consent transition. That hook is noted here so the
consent function is written with it in mind, but nothing about sessions is
built as part of this.

**Deleting a held account that never gets consent.** Nothing currently expires
an account whose parent never responds. It is the right thing to do and it is
not this change; it needs a retention decision first.

## Risks

**A parent who never receives the email.** Spam filtering, a typo, a school
address that blocks external mail. Mitigated by resend and by letting the
student correct the address, but a student whose parent simply does not act is
stuck. This is inherent to the model the product asked for: registration is not
complete until a parent acts. The holding screen must therefore be unambiguous
about what is required and offer a way to contact StudEasy.

**Prefetching email clients.** Some scanners follow links. Consent therefore
requires a POST from the page, never a GET on the token URL, and
`describe_consent_invitation` is the only thing the URL itself triggers.

**Rate limit as a denial of service.** Five sends total per student is
deliberate, but a student who burns them on typos is locked out of the only
route they have. An administrator can reset the counter; the runbook says how.
