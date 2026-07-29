'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isAuthConfigured } from '@/lib/supabase/client'
import { destinationForCurrentUser } from '@/app/auth/actions'
import { TextField } from '@/components/Field'

export default function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Those two do not match.')

    setBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      router.replace(await destinationForCurrentUser())
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="8+ characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        label="Confirm it"
        type="password"
        autoComplete="new-password"
        required
        placeholder="Type it again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy || !isAuthConfigured}
        className="mt-1 w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save new password'}
      </button>
      {error && (
        <p role="alert" className="text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </form>
  )
}
