import { redirect } from 'next/navigation'
import { destinationFor, hasRole, type Profile, type Role } from '@/lib/roles'

/** See app/portal/layout.tsx — development only, never true in production. */
export const DEV_PREVIEW = process.env.NODE_ENV === 'development'

/**
 * Sends anyone who does not hold this dashboard's role back to their own.
 *
 * Membership, not equality: a parent who is also an approved tutor reaches the
 * tutor dashboard whichever portal they happen to be signed in as. A role still
 * awaiting approval does not count, so a pending tutor is turned away.
 *
 * Bypassed in local development so the dev role switcher can reach all four
 * from a single login. This is navigation only — the database's row-level
 * security is what actually protects real data.
 */
export function guardRole(profile: Profile | null, required: Role): void {
  if (DEV_PREVIEW) return
  if (!hasRole(profile, required)) redirect(destinationFor(profile))
}
