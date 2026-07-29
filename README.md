# StudEasy

Public marketing site for StudEasy — NCEA and Cambridge Mathematics & Science
tutoring, pairing human tutors with an AI layer.

This repository contains **the marketing site plus authentication and
role-gated portal shells**. The portal *features* described in `prd.html` are
not implemented — signing in gets you to a page that names what that portal
owes its user and says plainly that it is not built.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS v4 · Framer Motion · lucide-react ·
React Router · Supabase (auth + Postgres). Type family is Kanit, from Google
Fonts.

## Running it

```bash
npm install
npm run dev
```

The site runs without any Supabase credentials — the marketing pages work
normally and the sign-in page shows a clear "not configured" notice instead of
failing. `npm run build` type-checks and bundles to `dist/`.

## Authentication setup

Google is the only identity provider. Three things need configuring, and none
of them can be done from this repository.

**1. Supabase project.** Create one, then run `supabase/schema.sql` in the SQL
Editor. Copy `.env.example` to `.env` and fill in the project URL and anon key
from Settings → API.

**2. Google OAuth client.** In Google Cloud Console create an OAuth 2.0 Web
client. Set the authorised redirect URI to
`https://<your-project-ref>.supabase.co/auth/v1/callback`. Paste the client ID
and secret into Supabase → Authentication → Providers → Google.

**3. Redirect URLs.** In Supabase → Authentication → URL Configuration, add
`http://localhost:5173/auth/callback` and your production equivalent.

### Roles

`student`, `parent` and `tutor` are chosen by the account holder on first
sign-in. `admin` is not selectable and never has been: it is granted only to
addresses in the `admin_allowlist` table, which is seeded with
`siddhartha.mohapatra@gmail.com`. Grant another administrator by inserting a
row — the account is promoted on its next sign-in.

Three database-side guards back this up, because the client cannot be trusted:
a trigger creates the profile row and applies the allowlist, a second trigger
rejects any attempt to change a role that is already set or to self-assign
`admin`, and row-level security limits reads to your own row, your linked
children, or everything if you are an admin. The route guards in
`src/auth/ProtectedRoute.tsx` are navigation convenience only.

`profiles.parent_id` exists for the parent→child link that PRD §12 requires
before an under-16 student account is consented. The column and its policy are
in place; the flow that populates it is not built.

### Deploying

Deep links like `/portal/student` need an SPA rewrite — every path must serve
`index.html`. Vite's dev server does this automatically; your host will need
the equivalent rule.

## Routes

| Path | Who |
| --- | --- |
| `/` | Everyone — marketing site |
| `/sign-in` | Signed out |
| `/auth/callback` | Google redirect target |
| `/choose-role` | Signed in, no role yet |
| `/portal/{student,parent,tutor,admin}` | Matching role only |
| `/portal` | Forwards to the caller's own portal |

## Layout

```
src/
  App.tsx              section order
  motion.ts            shared easing, viewport and enter variants
  useMagnetic.ts       cursor-follow hook for the hero CTA and device frame
  index.css            Tailwind theme tokens and gradient display type
  components/          one file per page section
public/img/            placeholder screenshots (see below)
```

## Placeholder assets

Everything under `public/img/` is a labelled placeholder SVG, sized to the
aspect ratio of the real asset it stands in for. Replace them and keep the
`width`/`height` attributes on the `<img>` in sync. The alt text in
`components/PortalShowcase.tsx` describes the *intended* screenshot content and
must be rewritten to match whatever the real screenshots actually show.

| File | Size | Stands in for |
| --- | --- | --- |
| `student-dashboard.svg` | 1600×1000 | Hero device frame |
| `portal-student-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Student portal collage |
| `portal-parent-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Parent portal collage |
| `portal-tutor-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Tutor portal collage |
| `portal-admin-main.svg` / `-inset.svg` | 1200×840 / 720×520 | Admin portal collage |
| `favicon.svg` | 64×64 | Browser tab icon |

## Accessibility

WCAG 2.1 AA is a build requirement, not a polish pass. Measured text contrast
sits between 6.1:1 and 14.9:1. Two deliberate deviations from the source design
exist for that reason: the display gradient starts at `#767C86` rather than
`#646973`, and the scroll-driven word reveal floors at 0.4 opacity rather than
0.2. `prefers-reduced-motion` disables every transform and scroll-driven effect
while leaving all content visible and readable.

## Known gaps against the PRD

`prd.html` specifies a full platform. What exists is the home page, sign-in and
role-gated portal shells. Not built: the Student, Parent, Tutor and Admin
portal features; booking beyond the UI (no tutor or slot selection, no Stripe
or POLi, no invoices); all eight AI features in §10; gamification; and every
public page other than Home. The PRD's §13 architecture also differs — it
specifies Next.js SSR/ISR for SEO and an Azure-hosted NestJS/ASP.NET backend,
where this is a Vite SPA talking directly to Supabase.

The PRD calls the product **TutorWise**; the site says **StudEasy**. One of
them needs to win.
