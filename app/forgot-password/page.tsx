import type { Metadata } from 'next'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Reset your password — StudEasy',
  robots: { index: false },
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      lede="We will email you a link. It works once and expires after an hour."
      footer={
        <p className="text-center text-[0.92rem] font-light text-ink-dim">
          Remembered it?{' '}
          <Link href="/sign-in" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
