'use client'

import { useState } from 'react'
import { createClient, isAuthConfigured } from '@/lib/supabase/client'
import { TextField } from '@/components/Field'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/portal`,
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.')
    } finally {
      setBusy(false)
    }
  }

  // Deliberately the same message whether or not the address exists, so this
  // form cannot be used to find out who has an account.
  if (sent) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-hairline bg-base p-5 text-[0.94rem] leading-relaxed font-light text-ink"
      >
        If there is an account for <span className="text-accent">{email}</span>, a reset
        link is on its way. Check your spam folder if it does not arrive.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy || !isAuthConfigured}
        className="w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      {error && (
        <p role="alert" className="text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </form>
  )
}
