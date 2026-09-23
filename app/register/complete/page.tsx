import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import RegisterWizard from '../RegisterWizard'

export const metadata: Metadata = {
  title: 'Finish setting up — StudEasy',
  robots: { index: false },
}

/** Where a Google signup lands: it has an account but no role yet. */
export default async function CompleteRegistrationPage() {
  const { profile } = await getCurrentUser()

  /*
   * Deliberately not `if (!userId) redirect('/sign-in')`.
   *
   * completeProfile() signs an under-age student out after it issues the
   * consent invitation — a cookie mutation, which Next treats like
   * revalidatePath and refreshes the current route with. That refresh reruns
   * this Server Component before the client-side wizard's setDone/setConsent
   * has a chance to matter, and it runs with the now-cleared session. If this
   * redirected on a missing user, that refresh would fire mid-flow and bounce
   * the student to /sign-in — signed out safely, but never having seen the
   * masked address or what happens next, which is the whole point of the
   * done screen. Not redirecting lets <RegisterWizard> — a Client Component —
   * stay mounted across that refresh, so its state survives.
   *
   * The cost: a visitor who lands here cold, with no session at all, also
   * sees the wizard instead of being bounced immediately. That is harmless —
   * completeProfile() itself refuses ("You are not signed in.") the moment
   * such a visitor tries to submit, so nothing is created or exposed.
   */
  if (profile?.role) redirect(destinationFor(profile))

  return <RegisterWizard completing knownName={profile?.full_name} />
}
