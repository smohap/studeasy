import { redirect } from 'next/navigation'
import { destinationFor, hasRole, type Profile, type Role } from '@/lib/roles'
import { DEV_PREVIEW } from '@/lib/dev-preview'

export { DEV_PREVIEW }

/**
 * Sends anyone who does not hold this dashboard's role back to their own.
 *
 * Membership, not equality: a parent who is also an approved tutor reaches the
 * tutor dashboard whichever portal they happen to be signed in as. A role still
 * awaiting approval does not count, so a pending tutor is turned away.
 *
 * Bypassed only when DEV_PREVIEW is on, which requires both a development
 * build and no Supabase credentials — so the bypass can only ever reach the
 * stub profile, never a real account. This is navigation only in any case; the
 * database's row-level security is what actually protects real data.
 */
export function guardRole(profile: Profile | null, required: Role): void {
  if (DEV_PREVIEW) return
  if (!hasRole(profile, required)) redirect(destinationFor(profile))
}
