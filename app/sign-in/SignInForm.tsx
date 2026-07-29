'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { createClient, isAuthConfigured } from '@/lib/supabase/client'
import { destinationForCurrentUser } from '@/app/auth/actions'
import GoogleButton, { OrDivider } from '@/components/GoogleButton'
import { TextField } from '@/components/Field'

export default function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(params.get('error'))

  const next = params.get('next')

  async function withGoogle() {
    setBusy('google')
    setError(null)
    try {
      const supabase = createClient()
      const redirect = new URL('/auth/callback', window.location.origin)
      if (next) redirect.searchParams.set('next', next)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirect.toString() },
      })
      if (error) throw error
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach Google.')
      setBusy(null)
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault()
    setBusy('email')
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const destination = await destinationForCurrentUser()
      router.replace(next?.startsWith('/') ? next : destination)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.')
      setBusy(null)
    }
  }

  return (
    <>
      {!isAuthConfigured && (
        <p
          role="alert"
          className="mb-7 flex gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-5 text-[0.9rem] leading-relaxed font-light text-ink"
        >
          <AlertCircle size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>
            Sign-in is not configured for this deployment. Add{' '}
            <code className="text-accent">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="text-accent">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </span>
        </p>
      )}

      <GoogleButton
        onClick={withGoogle}
        busy={busy === 'google'}
        disabled={busy !== null || !isAuthConfigured}
      />

      <OrDivider />

      <form onSubmit={withEmail} className="flex flex-col gap-5">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <Link
              href="/forgot-password"
              className="text-[0.82rem] font-normal text-accent hover:underline"
            >
              Forgot password?
            </Link>
          }
        />

        <button
          type="submit"
          disabled={busy !== null || !isAuthConfigured}
          className="mt-1 w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy === 'email' ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-5 text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </>
  )
}
