import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { ROLE_HOME, type Role } from './roles'

/**
 * Gate for everything under /portal. Sends signed-out visitors to sign-in,
 * role-less accounts to role selection, and anyone whose role does not match
 * the route back to their own portal.
 *
 * This is a convenience, not a security boundary — the database's row-level
 * security is what actually protects the data.
 */
export default function ProtectedRoute({
  allow,
  children,
}: {
  allow?: Role[]
  children: React.ReactNode
}) {
  const { loading, user, role } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid min-h-svh place-items-center px-6 text-ink-dim"
      >
        Checking your sign-in…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
  }

  if (!role) {
    return <Navigate to="/choose-role" replace />
  }

  if (allow && !allow.includes(role)) {
    return <Navigate to={ROLE_HOME[role]} replace />
  }

  return <>{children}</>
}
