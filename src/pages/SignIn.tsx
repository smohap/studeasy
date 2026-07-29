import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_HOME, SELECTABLE_ROLES, type SelectableRole } from '../auth/roles'
import { isAuthConfigured } from '../lib/supabase'
import GoogleButton from '../components/GoogleButton'
import AuthShell from '../components/AuthShell'

/**
 * Google is the only identity provider, so "sign in" and "register" are the
 * same button. Picking a role up front is a courtesy: the authoritative
 * assignment happens on /choose-role after the redirect, because a role held
 * in browser storage cannot survive every OAuth round trip.
 */
export default function SignIn() {
  const { user, role, signInWithGoogle } = useAuth()
  const location = useLocation()
  const [intent, setIntent] = useState<SelectableRole | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user && role) return <Navigate to={ROLE_HOME[role]} replace />
  if (user && !role) return <Navigate to="/choose-role" replace />

  const from = (location.state as { from?: string } | null)?.from

  async function start() {
    setBusy(true)
    setError(null)
    if (intent) sessionStorage.setItem('studeasy.intendedRole', intent)
    const { error } = await signInWithGoogle(from)
    if (error) {
      setError(error)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in to StudEasy"
      lede="One account for students, parents and tutors. We use your Google account so there is no extra password to remember."
    >
      {!isAuthConfigured && (
        <p
          role="alert"
          className="mb-8 flex gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-5 text-[0.92rem] leading-relaxed font-light text-ink"
        >
          <AlertCircle size={19} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>
            Sign-in is not configured for this deployment. Add{' '}
            <code className="text-accent">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-accent">VITE_SUPABASE_ANON_KEY</code>, then restart the
            dev server.
          </span>
        </p>
      )}

      <fieldset className="mb-8">
        <legend className="mb-4 text-[0.78rem] font-normal tracking-[0.16em] text-ink-dim uppercase">
          I am a… <span className="normal-case tracking-normal">(optional)</span>
        </legend>
        <div className="flex flex-col gap-3">
          {SELECTABLE_ROLES.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer gap-4 rounded-2xl border p-5 transition-colors ${
                intent === r.value
                  ? 'border-accent/60 bg-accent/[0.07]'
                  : 'border-hairline bg-base-raised hover:border-ink/30'
              }`}
            >
              <input
                type="radio"
                name="role-intent"
                value={r.value}
                checked={intent === r.value}
                onChange={() => setIntent(r.value)}
                className="mt-1.5 h-4 w-4 shrink-0 accent-[#E3B341]"
              />
              <span>
                <span className="block text-[1rem] font-medium text-ink">{r.label}</span>
                <span className="mt-1 block text-[0.9rem] leading-relaxed font-light text-ink-dim">
                  {r.blurb}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <GoogleButton onClick={start} disabled={busy || !isAuthConfigured} busy={busy} />

      {error && (
        <p role="alert" className="mt-5 text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}

      <p className="mt-8 text-[0.85rem] leading-relaxed font-light text-ink-dim">
        Students under 16 need a parent or caregiver to approve the account before
        lessons start. We will ask for that once you are in.
      </p>

      <Link
        to="/"
        className="mt-10 inline-flex items-center gap-2 text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to the site
      </Link>
    </AuthShell>
  )
}
