import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import AuthShell from '@/components/AuthShell'
import { getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import SignInForm from './SignInForm'

export const metadata: Metadata = {
  title: 'Sign in — StudEasy',
  robots: { index: false },
}

export default async function SignInPage() {
  const { profile, userId } = await getCurrentUser()
  if (userId) redirect(destinationFor(profile))

  return (
    <AuthShell
      title="Welcome back"
      lede="Sign in to see homework, reports and your next lesson."
      footer={
        <p className="text-center text-[0.92rem] font-light text-ink-dim">
          New here?{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Register
          </Link>
        </p>
      }
    >
      <Suspense fallback={<div className="h-64" aria-hidden />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  )
}
