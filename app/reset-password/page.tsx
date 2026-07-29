import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import AuthShell from '@/components/AuthShell'
import { getCurrentUser } from '@/lib/supabase/server'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Choose a new password — StudEasy',
  robots: { index: false },
}

/**
 * Where a password-reset email lands, after /auth/callback has exchanged the
 * recovery code for a session. Without that session there is nothing to
 * update, so an uninvited visitor is sent back to ask for a fresh link.
 */
export default async function ResetPasswordPage() {
  const { userId } = await getCurrentUser()
  if (!userId) redirect('/forgot-password')

  return (
    <AuthShell
      title="Choose a new password"
      lede="This replaces your old one straight away. You will stay signed in on this device."
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}
