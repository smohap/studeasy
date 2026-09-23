# Deploying the parental consent gate

What this adds: a student under 13 cannot accumulate a learning record until a
linked parent or caregiver confirms their account.

Read `supabase/consent.sql` before running it. The header explains the two
decisions it encodes and, more importantly, the one it does not — the gate is
not a proof of age, and the file says so.

## Order

Run **after** `multi-role.sql`, `marketplace.sql`, `family.sql`, `audit.sql`,
`assessments.sql` and `economy.sql`. It alters policies and adds triggers that
reference all of them. `marketplace.sql` is on that list for one column —
`profiles.organization_id` — which the notification and the audit row read.

1. Paste `supabase/consent.sql` into the Supabase SQL editor and run it.
2. Read the four columns the file selects at the end. All three booleans must
   be true. `legacy_backfilled` is a count — see below.
3. Run `supabase/tests/helpers.sql` once if you have not already, then
   `supabase/tests/consent_test.sql`. Expect 25 passing assertions.

## What the backfill did, and the debt it leaves

Every student who already existed was marked `consent_basis = 'legacy'`.

**That is not consent.** It means: this account registered before the gate
existed, and nobody has established its age. Those students are not blocked,
because retrospectively locking a live platform's entire student body out of
their own work is not a defensible way to introduce a safeguard — and blocking
them would not undo the collection that has already happened, which is the
thing consent is about.

List them:

```sql
select * from studeasy.students_missing_dob();
```

Work through that list. For each, get a date of birth and set it as an
administrator; the trigger will then either clear them automatically (16 or
over) or gate them properly (under 13). The list is empty when the debt is
paid, and every account registered after this migration is gated correctly
without any action.

## What is gated, and what deliberately is not

Blocked for a student with no basis:

- starting an attempt (`attempts` — both an RLS policy and a trigger)
- recording answers (`answers`)
- earning coins or house points (rows are skipped, not raised)

**Not** blocked, on purpose: signing in, reading their own profile, and
**approving a parent's link request**. That last one is the seam. Consent comes
from a parent who is linked, and linking requires the student to approve them —
so gating that action would leave the account permanently stuck with no route
out. `supabase/tests/consent_test.sql` asserts it stays open.

**Not blocked, and worth knowing about:** checkout. A gated student can still
add a course to the cart and pay for it. The scope of this gate is the learning
record — the thing consent is actually about — and buying a course creates an
enrolment, not a record of the child's work. They still cannot sit anything
they have bought. If that should change it is a separate decision, not an
oversight in this one.

## Re-running other migrations afterwards

`consent.sql` rewrites `attempts_insert` and `answers_write`, which are
declared in `assessments.sql`. **Re-running `assessments.sql` restores the
ungated versions of those two policies**, silently and with no error.

The gate survives that, because the load-bearing half is the
`attempts_consent_gate` trigger defined in `consent.sql`, which
`assessments.sql` does not touch. Re-run `consent.sql` afterwards anyway to put
the policies back. It is idempotent.

The same reasoning is why none of this is folded into `handle_new_user()` or
`guard_profile()` in `schema.sql`: those are `create or replace`, and a re-run
would have deleted the gate while leaving something that looked like one.

## Deploy ordering with Vercel

The app tolerates this migration being late. `getCurrentUser()` asks for the
consent columns in a separate query that is allowed to fail, and the parent
portal's two consent queries are allowed to fail the same way, so a deployment
that reaches production before the SQL is run shows no consent UI rather than
500ing. An absent column reads as "no gate installed", never as "gate closed" —
otherwise every student would be locked out by a migration that had not run.

The reverse order is also safe: running the SQL before the deploy gates new
under-age registrations immediately, and the old bundle simply does not render
the panels.

## Before you merge

This changes registration, which every new student passes through. Walk a real
signup on the preview deployment first — one under 13 and one over — and check
the younger one lands on the waiting screen with their Student ID showing.
