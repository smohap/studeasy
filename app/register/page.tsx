import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import RegisterWizard from './RegisterWizard'

export const metadata: Metadata = {
  title: 'Register — StudEasy',
  robots: { index: false },
}

export default async function RegisterPage() {
  const { userId, profile } = await getCurrentUser()

  // Already signed in with a role — nothing to register.
  if (userId && profile?.role) redirect(destinationFor(profile))

  return <RegisterWizard completing={Boolean(userId)} knownName={profile?.full_name} />
}
