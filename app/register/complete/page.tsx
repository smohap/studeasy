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
  const { userId, profile } = await getCurrentUser()

  if (!userId) redirect('/sign-in')
  if (profile?.role) redirect(destinationFor(profile))

  return <RegisterWizard completing knownName={profile?.full_name} />
}
