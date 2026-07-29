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

## Setup

Three things need configuring, none of which can be done from this repository.

**1. Supabase.** Run `supabase/schema.sql` in the SQL Editor, then **add
`studeasy` to Settings → API → "Exposed schemas"**. PostgREST will not serve a
schema that is not listed, so every query fails until you do. Copy
`.env.example` to `.env.local` and fill in the URL and anon key from
Settings → API.

The Supabase project is shared with other apps, so StudEasy keeps to its own
`studeasy` Postgres schema and its environment variables carry a `StudEasy_`
prefix. The app reads exactly two:
`NEXT_PUBLIC_StudEasy_SUPABASE_URL` and
`NEXT_PUBLIC_StudEasy_SUPABASE_ANON_KEY`. It never reads the service-role,
secret, JWT or `POSTGRES_*` variables — those bypass row-level security and
must not reach a browser bundle.

**2. Google OAuth client.** In Google Cloud Console create an OAuth 2.0 Web
client with the authorised redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and
secret into Supabase → Authentication → Providers → Google.

**3. Redirect URLs.** In Supabase → Authentication → URL Configuration, add
`http://localhost:3000/auth/callback` and your Vercel URL's equivalent.

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

| Path | Who |
| --- | --- |
| `/` | Everyone — marketing site |
| `/sign-in` | Signed out — Google or email/password |
| `/register` | Signed out — four-step wizard |
| `/register/complete` | Signed in via Google, no role yet |
| `/forgot-password` | Signed out |
| `/auth/callback` | OAuth redirect target |
| `/portal/{student,parent,tutor,admin}` | Matching role only |

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

Not built: the Student, Parent and Tutor portal features; booking beyond the
form UI (no tutor or slot selection, no Stripe or POLi, no invoices); all eight
AI features in §10; gamification; and every public page other than Home.
