# StudEasy

Public marketing site for StudEasy — NCEA and Cambridge Mathematics & Science
tutoring, pairing human tutors with an AI layer.

This repository currently contains **the marketing site only**. The Student,
Parent, Tutor and Admin portals described in `prd.html` are not implemented; the
portal showcase on the home page displays static placeholder screenshots.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS v4 · Framer Motion · lucide-react.
Type family is Kanit, loaded from Google Fonts.

## Running it

```bash
npm install
npm run dev
```

`npm run build` type-checks and produces a production bundle in `dist/`.
`npm run preview` serves that bundle.

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

`prd.html` specifies a full platform. Beyond the home page, none of it is built:
no authentication, no routing, no backend, no database, no payments, no AI
features, and no portals. The booking form is UI only and submits nowhere.
