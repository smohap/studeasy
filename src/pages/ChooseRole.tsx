import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  ROLE_HOME,
  SELECTABLE_ROLES,
  type SelectableRole,
} from '../auth/roles'
import AuthShell from '../components/AuthShell'

/**
 * Authoritative role assignment, shown once after a new account's first
 * sign-in. The database rejects a second attempt, so this cannot be replayed
 * to change roles later.
 */
export default function ChooseRole() {
  const { loading, user, role, profile, chooseRole } = useAuth()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<SelectableRole | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preselect whatever they picked before being sent to Google.
  useEffect(() => {
    const stored = sessionStorage.getItem('studeasy.intendedRole')
    if (stored && SELECTABLE_ROLES.some((r) => r.value === stored)) {
      setChoice(stored as SelectableRole)
    }
  }, [])

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="grid min-h-svh place-items-center text-ink-dim">
        Loading your account…
      </div>
    )
  }
  if (!user) return <Navigate to="/sign-in" replace />
  if (role) return <Navigate to={ROLE_HOME[role]} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!choice) return
    setBusy(true)
    setError(null)

    const { error } = await chooseRole(choice)
    if (error) {
      setError(error)
      setBusy(false)
      return
    }
    sessionStorage.removeItem('studeasy.intendedRole')
    navigate(ROLE_HOME[choice], { replace: true })
  }

  const name = profile?.full_name?.split(' ')[0]

  return (
    <AuthShell
      title={name ? `Kia ora, ${name}` : 'One more thing'}
      lede="Tell us which portal you need. This sets up your account and cannot be changed later without asking us — so pick carefully."
    >
      <form onSubmit={submit}>
        <fieldset>
          <legend className="sr-only">Choose your role</legend>
          <div className="flex flex-col gap-3">
            {SELECTABLE_ROLES.map((r) => (
              <label
                key={r.value}
                className={`flex cursor-pointer gap-4 rounded-2xl border p-5 transition-colors ${
                  choice === r.value
                    ? 'border-accent/60 bg-accent/[0.07]'
                    : 'border-hairline bg-base-raised hover:border-ink/30'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={choice === r.value}
                  onChange={() => setChoice(r.value)}
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

        <button
          type="submit"
          disabled={!choice || busy}
          className="mt-8 w-full rounded-full bg-accent px-8 py-4 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy ? 'Setting up your account…' : 'Continue'}
        </button>

        {error && (
          <p role="alert" className="mt-5 text-[0.9rem] font-light text-[#F0A0A0]">
            {error}
          </p>
        )}
      </form>
    </AuthShell>
  )
}
