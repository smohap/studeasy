import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasRole, type AccountStatus, type GrantedRole, type Role } from '@/lib/roles'

export type PersonRow = {
  id: string
  fullName: string | null
  email: string | null
  studentCode: string | null
  /** Which portal they are currently in. Not a permission. */
  activeRole: Role | null
  roles: GrantedRole[]
  signedUpAt: string
  /** From auth.users. Null when the admin API is unavailable, or never signed in. */
  lastSignInAt: string | null
  emailConfirmed: boolean
}

/**
 * Everyone on the platform, with when they joined and when they last signed in.
 *
 * The admin dashboard used to render five hard-coded names from a fixtures
 * file, captioned "Demo records" — real accounts never appeared anywhere.
 *
 * Sign-in times live in auth.users, which is outside the exposed `studeasy`
 * schema and unreachable from the request-scoped client, so that half comes
 * from the admin API on the service-role client. That client bypasses RLS
 * entirely, which is why the caller is checked here rather than trusted from
 * the route guard — guardRole() is bypassed in development by design, and this
 * must not be.
 */
export async function listPeople(): Promise<PersonRow[]> {
  if (!isAuthConfigured) return []

  const { profile } = await getCurrentUser()
  if (!hasRole(profile, 'admin')) return []

  const supabase = await createClient()

  const [{ data: profiles }, { data: roleRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, student_code, role, status, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('profile_roles').select('profile_id, role, status'),
  ])

  const people = (profiles ?? []) as {
    id: string
    full_name: string | null
    email: string | null
    student_code: string | null
    role: Role | null
    status: AccountStatus
    created_at: string
  }[]

  const grants = (roleRows ?? []) as {
    profile_id: string
    role: Role
    status: AccountStatus
  }[]

  /*
   * Best-effort. A missing service-role key should cost the sign-in column, not
   * the whole page — the signup list is the more important half and comes from
   * the ordinary client.
   */
  const authById = new Map<string, { lastSignInAt: string | null; confirmed: boolean }>()
  try {
    const admin = createServiceClient()
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of data?.users ?? []) {
      authById.set(u.id, {
        lastSignInAt: u.last_sign_in_at ?? null,
        confirmed: Boolean(u.email_confirmed_at),
      })
    }
  } catch (error) {
    console.error(
      'Sign-in times unavailable — needs StudEasy_SUPABASE_SERVICE_ROLE_KEY:',
      error instanceof Error ? error.message : error,
    )
  }

  return people.map((p) => {
    const mine = grants.filter((g) => g.profile_id === p.id)
    return {
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      studentCode: p.student_code,
      activeRole: p.role,
      /*
       * Before multi-role.sql is run there are no grant rows; fall back to the
       * single role the account already had, so the page is never blank.
       */
      roles:
        mine.length > 0
          ? mine.map((g) => ({ role: g.role, status: g.status }))
          : p.role
            ? [{ role: p.role, status: p.status }]
            : [],
      signedUpAt: p.created_at,
      lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
      emailConfirmed: authById.get(p.id)?.confirmed ?? false,
    }
  })
}
