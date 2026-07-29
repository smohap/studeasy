import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isRole, type Role, type SelectableRole } from './roles'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: Role | null
}

type AuthState = {
  /** False once the initial session lookup has settled. */
  loading: boolean
  user: User | null
  session: Session | null
  profile: Profile | null
  /** Null until the account has chosen (or been granted) a role. */
  role: Role | null
  signInWithGoogle: (next?: string) => Promise<{ error: string | null }>
  chooseRole: (role: SelectableRole) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function toProfile(row: Record<string, unknown> | null): Profile | null {
  if (!row) return null
  return {
    id: String(row.id),
    email: (row.email as string) ?? null,
    full_name: (row.full_name as string) ?? null,
    avatar_url: (row.avatar_url as string) ?? null,
    role: isRole(row.role) ? row.role : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Could not load profile:', error.message)
      return null
    }
    return toProfile(data)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session?.user) setProfile(await loadProfile(data.session.user.id))
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return
      setSession(next)
      setProfile(next?.user ? await loadProfile(next.user.id) : null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithGoogle = useCallback(async (next?: string) => {
    if (!supabase) return { error: 'Sign-in is not configured for this deployment.' }

    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    })
    return { error: error?.message ?? null }
  }, [])

  /**
   * Writes the chosen role. The database rejects this if a role is already set
   * or if the value is `admin`, so a tampered client cannot escalate.
   */
  const chooseRole = useCallback(
    async (role: SelectableRole) => {
      const userId = session?.user?.id
      if (!supabase || !userId) return { error: 'You are not signed in.' }

      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
      if (error) return { error: error.message }

      setProfile(await loadProfile(userId))
      return { error: null }
    },
    [session, loadProfile],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      signInWithGoogle,
      chooseRole,
      signOut,
    }),
    [loading, session, profile, signInWithGoogle, chooseRole, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
