import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import { useAuth } from './auth/AuthProvider'
import { ROLE_HOME } from './auth/roles'
import Home from './pages/Home'
import SignIn from './pages/SignIn'
import AuthCallback from './pages/AuthCallback'
import ChooseRole from './pages/ChooseRole'
import Portal from './pages/Portal'

/** /portal is a convenience entry point — it forwards to the caller's own portal. */
function PortalRedirect() {
  const { loading, user, role } = useAuth()
  if (loading) {
    return (
      <div role="status" aria-live="polite" className="grid min-h-svh place-items-center text-ink-dim">
        Checking your sign-in…
      </div>
    )
  }
  if (!user) return <Navigate to="/sign-in" replace />
  if (!role) return <Navigate to="/choose-role" replace />
  return <Navigate to={ROLE_HOME[role]} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/choose-role" element={<ChooseRole />} />

      <Route
        path="/portal/student"
        element={
          <ProtectedRoute allow={['student']}>
            <Portal role="student" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/parent"
        element={
          <ProtectedRoute allow={['parent']}>
            <Portal role="parent" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/tutor"
        element={
          <ProtectedRoute allow={['tutor']}>
            <Portal role="tutor" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/admin"
        element={
          <ProtectedRoute allow={['admin']}>
            <Portal role="admin" />
          </ProtectedRoute>
        }
      />

      {/* Sends a signed-in user to whichever portal their role owns. */}
      <Route path="/portal" element={<PortalRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
