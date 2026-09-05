# StudEasy

Marketing site and account system for StudEasy — NCEA and Cambridge Mathematics
& Science tutoring, pairing human tutors with an AI layer.

The PRD in `prd.html` calls the product *TutorWise*. **StudEasy is the
canonical name**; treat the PRD's name as historic.

What exists: the marketing home page, Google and email/password sign-in, a
four-step registration wizard with role-specific questions, tutor approval by a
site administrator, parent-to-student linking, and role-gated portal shells.
The portal *features* in the PRD are not built — each portal says so rather
than showing mock data.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · Framer Motion ·
lucide-react · Supabase (auth + Postgres). Type family is Kanit via
`next/font`. Built to deploy on Vercel.

## Running it

```bash
npm install
npm run dev
```

The site runs with no Supabase credentials — marketing pages work normally and
the auth pages show a clear "not configured" notice instead of failing.
`npm run build` produces a production build; `npm run lint` type-checks.

`npm test` runs the Vitest suite over the pure TypeScript in `lib/`.

SQL is tested with pgTAP. There is no Supabase CLI here, so tests run the way
migrations do: paste `supabase/tests/helpers.sql` once to install the
fixtures, then paste any `supabase/tests/*_test.sql` file into the SQL Editor
and read the `ok` / `not ok` rows. Every test file wraps itself in
`begin`/`rollback`, so running one leaves nothing behind.

## Setup

Four things need configuring, none of which can be done from this repository.

**1. Supabase.** Run the migrations below in the SQL Editor, in order. Copy
`.env.example` to `.env.local` and fill in the URL and anon key from
Settings → API.

The Supabase project is shared with other apps, so StudEasy keeps to its own
`studeasy` Postgres schema and its environment variables carry a `StudEasy_`
prefix. The app reads exactly two:
`NEXT_PUBLIC_StudEasy_SUPABASE_URL` and
`NEXT_PUBLIC_StudEasy_SUPABASE_ANON_KEY`. It never reads the service-role,
secret, JWT or `POSTGRES_*` variables — those bypass row-level security and
must not reach a browser bundle.

### Database migrations

`supabase/` holds one file per slice of the schema. Every one is idempotent, so
re-running is safe. Run them **in this order** — later files alter tables and
call functions that earlier ones create:

```
schema.sql            marketplace.sql       payments.sql
platform.sql          assessments.sql       classes-forum.sql
classes-followup.sql  multi-role.sql        family.sql
scheduling.sql        assessment-modes.sql  assessment-timing.sql
assessment-marking.sql content-and-help.sql badges.sql
messaging.sql         analytics.sql         audit.sql
public-site.sql       question-types.sql    refunds.sql
taxonomy.sql
```

After `schema.sql`, **add `studeasy` to Settings → API → "Exposed schemas"**.
PostgREST will not serve a schema that is not listed, so every query fails
until you do.

Until a file has been run, the pages that depend on it say what is missing
rather than erroring — an empty tutor directory, a blank contact inbox, a
refund panel that names the file. That is the intended behaviour, not a bug.

**2. Google OAuth client.** In Google Cloud Console create an OAuth 2.0 Web
client with the authorised redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and
secret into Supabase → Authentication → Providers → Google.

**3. Redirect URLs.** In Supabase → Authentication → URL Configuration, add
`http://localhost:3000/auth/callback` and your Vercel URL's equivalent.

**4. Stripe**, if you want paid courses. Set `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` and `StudEasy_SUPABASE_SERVICE_ROLE_KEY`, and point a
webhook endpoint at `/api/stripe/webhook` with these events enabled:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, `refund.updated`, `refund.failed`. The webhook is the only
thing that may mark an order paid or a refund settled; without it, checkout
takes money and enrols nobody.

### Deploying to Vercel

Import the repo, then set `NEXT_PUBLIC_StudEasy_SUPABASE_URL` and
`NEXT_PUBLIC_StudEasy_SUPABASE_ANON_KEY` for Production, Preview and
Development, plus `NEXT_PUBLIC_SITE_URL` on Production only. No other
configuration is needed — no rewrite rules, since this is not an SPA.

## Accounts and roles

**Students** choose a year level and the subjects they want help with, and are
issued a Student ID (`STU-XXXXXX`) shown on their portal.

**Parents** register by quoting their child's Student ID, which links the two
accounts. More children can be linked later from the parent portal.

**Tutors** choose the subjects they will teach and land in `pending`. They can
sign in, but the tutor portal stays locked until a site administrator approves
them, because tutors can see students' work. Approve or decline from
`/portal/admin`.

**Administrators** are never self-selectable. The role is granted only to
addresses in the `admin_allowlist` table, seeded with
`siddhartha.mohapatra@gmail.com`. Add a row to grant another; the account is
promoted on its next sign-in.

### Why the database does the enforcing

The client is not trusted with any of the above. A trigger on `auth.users` —
named `studeasy_on_auth_user_created`, so it cannot collide with another app in
the shared project — creates the profile and resolves the role, ignoring
anything but student/parent/tutor and applying the allowlist. A second trigger rejects
changing a role once set, self-assigning `admin`, or touching `status`,
`student_code`, `parent_id` or the approval columns. Parent linking and tutor
approval go through `SECURITY DEFINER` functions that check the caller.
Row-level security limits reads to your own row, your linked children, or
everything for an admin. The `proxy.ts` guard and the portal layout redirects
are navigation convenience, not the security boundary.

PRD §12 requires parental consent for under-16 students. `parent_id` and the
linking flow are the foundation for that; the consent gate itself is not built.

## Routes

### Public

| Path | What it shows |
| --- | --- |
| `/` | Marketing site |
| `/about` | Who StudEasy is, and how a child's safety is handled |
| `/subjects`, `/subjects/[slug]` | Subjects, generated from what tutors teach and courses cover |
| `/tutors`, `/tutors/[id]` | Approved, listed tutors only |
| `/pricing` | The cheapest published price per subject — there is no price list |
| `/success-stories` | Consented, anonymised improvement, and published reviews |
| `/resources` | Free library items and study guides |
| `/blog`, `/blog/[slug]` | Posts by approved tutors and administrators |
| `/faq`, `/contact` | Answers, and a form a person reads |
| `/courses`, `/classes`, `/library`, `/forum` | The catalog |
| `/verify`, `/verify/[serial]` | Certificate check — no account needed |
| `/sitemap.xml`, `/robots.txt` | Generated from the same queries the pages use |

### Signed out

| Path | Who |
| --- | --- |
| `/sign-in` | Google or email/password |
| `/register` | Four-step wizard |
| `/register/complete` | Signed in via Google, no role yet |
| `/forgot-password`, `/reset-password` | — |
| `/auth/callback` | OAuth redirect target |

### Portal

| Path | Who |
| --- | --- |
| `/portal/{student,parent,tutor,admin}` | Matching role only |
| `/portal/profile` | Everyone — details, roles, tutor listing, reporting consent |
| `/portal/messages` | Everyone, along relationships that already exist |
| `/portal/blog` | Approved tutors and administrators |
| `/portal/admin/{analytics,people,finance,audit,contact}` | Administrators |
| `/assess/[id]` | A student sitting a paper |

Everything under `/portal` carries `robots: { index: false }`, and
`app/robots.ts` disallows the whole prefix.

## Placeholder assets

Everything under `public/img/` is a labelled placeholder SVG at the aspect
ratio of the real asset. Replace them and keep the `width`/`height` attributes
in sync. The alt text in `components/PortalShowcase.tsx` describes the
*intended* screenshot and must be rewritten to match the real ones.

| File | Size | Stands in for |
| --- | --- | --- |
| `student-dashboard.svg` | 1600×1000 | Hero device frame |
| `portal-student-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Student collage |
| `portal-parent-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Parent collage |
| `portal-tutor-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Tutor collage |
| `portal-admin-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Admin collage |
| `favicon.svg` | 64×64 | Browser tab icon |

## Accessibility

WCAG 2.1 AA is a build requirement. Measured text contrast on the marketing
page sits between 6.1:1 and 14.9:1. Two deliberate deviations from the source
design exist for that reason: the display gradient starts at `#767C86` rather
than `#646973`, and the scroll-driven word reveal floors at 0.4 opacity rather
than 0.2. `prefers-reduced-motion` disables every transform and scroll-driven
effect while leaving all content visible.

## Known gaps against the PRD

Built since this section last said otherwise: all four portals on real data,
the catalog and checkout, live classes and the forum, assessments in three
delivery modes with all eleven question types, certificates, messaging,
reporting, the audit log, refunds, and every public page in §4.

Still not built:

**All eight AI features in §10** — Learning Twin, Predictive Marks, Homework
Scanner, Revision Planner, Smart Question Bank, Study Buddy chat, Automatic
Lesson Summary and the Tutor AI Assistant. Nothing on this platform is an AI
feature today. Two have a worked human equivalent already: the help-request
queue is the Homework Scanner's flow without the OCR, and tutor-written lesson
notes stand in for the Automatic Lesson Summary.

The marketing copy on the home page calls the pairing an "AI Learning Twin",
which is ahead of the software. That wants fixing in one direction or the
other before launch — §10's own guardrail says every AI answer must be
traceable to the academy's own curriculum rather than an ungrounded model,
and that is the harder half to build.

**Most of gamification (§11).** XP, levels, daily streaks and badges are
real and awarded from actual academic events. The rest of the section is not:
coins, the reward shop, quiz battles, house points, avatar upgrades, and the
weekly-challenge and monthly-champion leaderboards.

**POLi.** Card payments go through Stripe; the PRD also asks for POLi, which
is not wired up.

**Parental consent for under-16s (§12).** `parent_id`, the child-approved
linking flow, and `share_progress_consent` are the foundation. The consent
gate on registration itself is not built.

**Tutor payouts as money.** `payouts` is a truthful ledger of what is owed,
and refunds reverse it, but nothing settles it — Stripe Connect is not
integrated, so a tutor is paid outside the platform.

**Deleting an account.** The FAQ says to ask us, and that is accurate: there
is no self-service delete, because the cascade reaches a child's marked work.

**Placeholder imagery.** Everything under `public/img/` is still a labelled
placeholder SVG.
