import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_HOME } from '../auth/roles'

/**
 * Landing point for the Google redirect. The Supabase client parses the
 * session out of the URL on its own; this page only waits for the provider to
 * settle and then routes by role.
 */
export default function AuthCallback() {
  const { loading, user, role } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const providerError = params.get('error_description') ?? params.get('error')
  const next = params.get('next')

  useEffect(() => {
    if (loading || providerError) return

    if (!user) {
      navigate('/sign-in', { replace: true })
    } else if (!role) {
      navigate('/choose-role', { replace: true })
    } else {
      navigate(next && next.startsWith('/') ? next : ROLE_HOME[role], { replace: true })
    }
  }, [loading, user, role, next, providerError, navigate])

  if (providerError) {
    return (
      <div className="grid min-h-svh place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-[1.4rem] font-semibold text-ink">Sign-in didn't complete</h1>
          <p role="alert" className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
            {providerError}
          </p>
          <button
            type="button"
            onClick={() => navigate('/sign-in', { replace: true })}
            className="mt-8 rounded-full bg-accent px-7 py-3.5 text-[0.92rem] font-medium text-[#100c00]"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite" className="grid min-h-svh place-items-center px-6 text-ink-dim">
      Finishing sign-in…
    </div>
  )
}
