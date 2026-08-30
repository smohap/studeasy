import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { GrantedRole, Profile } from '@/lib/roles'
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from './config'

export { isAuthConfigured }

/** See getCurrentUser — only ever returned in an unconfigured dev build. */
const DEV_STUB = {
  userId: 'dev-preview',
  email: 'dev@studeasy.invalid',
  profile: {
    id: 'dev-preview',
    email: 'dev@studeasy.invalid',
    full_name: 'Dev Preview',
    avatar_url: null,
    role: 'admin',
    status: 'active',
    // Deliberately several, so the multi-role switcher is reviewable offline.
    roles: [
      { role: 'admin', status: 'active' },
      { role: 'tutor', status: 'active' },
      { role: 'parent', status: 'active' },
      { role: 'student', status: 'active' },
    ],
    student_code: 'STU-DEV001',
    year_level: 'Year 11 · NCEA Level 1',
    subjects: ['Mathematics', 'Physics'],
    teaching_subjects: ['Mathematics', 'Physics'],
    parent_id: null,
    organization_id: null,
  } satisfies Profile,
} as const

/** Supabase client for server components, route handlers and server actions. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      db: { schema: DB_SCHEMA },
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
  if (!isAuthConfigured) {
    /*
     * DEV-ONLY stand-in, so the dashboards can be reviewed without a Supabase
     * project. Both conditions must hold: no credentials configured AND a
     * development build. A Vercel deployment is always NODE_ENV=production, and
     * configuring credentials disables this too — so it cannot leak into a real
     * environment. Remove with the dev role switcher.
     */
    if (process.env.NODE_ENV === 'development') return DEV_STUB
    return { userId: null, email: null, profile: null }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, email: null, profile: null }

  const [{ data }, { data: roleRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, full_name, avatar_url, role, status, student_code, year_level, subjects, teaching_subjects, parent_id, organization_id',
      )
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('profile_roles').select('role, status').eq('profile_id', user.id),
  ])

  if (!data) return { userId: user.id, email: user.email ?? null, profile: null }

  const base = data as Omit<Profile, 'roles'>
  const granted = (roleRows ?? []) as GrantedRole[]

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: {
      ...base,
      /*
       * Before multi-role.sql is run this table does not exist and the query
       * comes back empty. Falling back to the active role keeps every
       * permission check behaving exactly as it did when one account meant one
       * role, rather than locking everybody out of everything.
       */
      roles:
        granted.length > 0
          ? granted
          : base.role
            ? [{ role: base.role, status: base.status }]
            : [],
    },
  }
}
