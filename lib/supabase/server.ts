import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Profile } from '@/lib/roles'

export const isAuthConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

/** Supabase client for server components, route handlers and server actions. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a server component, where cookies are read-only.
            // The middleware refreshes the session instead.
          }
        },
      },
    },
  )
}

/**
 * The signed-in account and its profile, or nulls. Uses getUser() rather than
 * getSession() because only getUser() revalidates the token with the auth
 * server — a cookie alone is not proof of identity.
 */
export async function getCurrentUser(): Promise<{
  userId: string | null
  email: string | null
  profile: Profile | null
}> {
  if (!isAuthConfigured) return { userId: null, email: null, profile: null }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, email: null, profile: null }

  const { data } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, avatar_url, role, status, student_code, year_level, subjects, teaching_subjects, parent_id',
    )
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (data as Profile) ?? null,
  }
}
