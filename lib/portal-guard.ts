import { redirect } from 'next/navigation'
import { destinationFor, type Profile, type Role } from '@/lib/roles'

/** See app/portal/layout.tsx — development only, never true in production. */
export const DEV_PREVIEW = process.env.NODE_ENV === 'development'

/**
 * Sends anyone whose role does not own this dashboard back to their own.
 *
 * Bypassed in local development so the dev role switcher can reach all four
 * from a single login. This is navigation only — the database's row-level
 * security is what actually protects real data, and these dashboards render
 * fixtures regardless.
 */
export function guardRole(profile: Profile | null, required: Role): void {
  if (DEV_PREVIEW) return
  if (profile?.role !== required) redirect(destinationFor(profile))
}
