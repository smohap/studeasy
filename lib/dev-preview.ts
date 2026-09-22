import { isAuthConfigured } from '@/lib/supabase/config'

/**
 * The one switch every piece of development-only scaffolding hangs off.
 *
 * It used to be two constants — one in lib/portal-guard.ts, one in
 * app/portal/layout.tsx — both testing only NODE_ENV, and the layout's comment
 * still said "every dashboard renders fixtures, so nothing real is exposed".
 * That stopped being true when the fixtures were deleted. Since then, running
 * `next dev` against the real Supabase project and opening /portal/admin would
 * have walked straight past guardRole() and shown a developer signed in as a
 * student the actual list of every account on the platform.
 *
 * So the condition now has a second half: the scaffolding is live only when
 * there are **no credentials configured**, which is the only state in which
 * there is genuinely nothing real to expose. `next dev` against a real project
 * behaves exactly as production does.
 *
 * Two independent conditions, both of which fail closed:
 *
 *   * NODE_ENV is 'production' in every Vercel deployment, preview included.
 *   * A deployment with credentials has isAuthConfigured true.
 *
 * A production build therefore cannot enable this even if the first check were
 * somehow wrong.
 */
export const DEV_PREVIEW = process.env.NODE_ENV === 'development' && !isAuthConfigured
