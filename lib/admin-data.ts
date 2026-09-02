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
  /**
   * True confirmed, false genuinely unconfirmed, null we could not find out.
   *
   * The third state matters: false is an assertion about someone's account, and
   * making it the fallback for a failed lookup turned a broken API call into a
   * badge against every person on the platform.
   */
  emailConfirmed: boolean | null
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
export async function listPeople(): Promise<{
  people: PersonRow[]
  /** Non-null when the Supabase admin API could not be reached. */
  authError: string | null
}> {
  if (!isAuthConfigured) return { people: [], authError: null }

  const { profile } = await getCurrentUser()
  if (!hasRole(profile, 'admin')) return { people: [], authError: null }

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
   * Best-effort. Losing this should cost the sign-in and confirmation columns,
   * not the whole page — the signup list is the more important half and comes
   * from the ordinary client.
   *
   * listUsers() returns { data, error }; it does not throw when the API refuses
   * us. An earlier version destructured only `data`, so a refusal passed
   * silently, the map stayed empty, and every account rendered as never signed
   * in and email unconfirmed. authError now carries the reason up to the page,
   * so a failure is visible as a failure rather than read as a finding.
   */
  const authById = new Map<string, { lastSignInAt: string | null; confirmed: boolean }>()
  let authError: string | null = null

  try {
    const admin = createServiceClient()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })

    if (error) {
      authError = error.message
    } else {
      for (const u of data?.users ?? []) {
        authById.set(u.id, {
          lastSignInAt: u.last_sign_in_at ?? null,
          confirmed: Boolean(u.email_confirmed_at),
        })
      }
    }
  } catch (error) {
    authError = error instanceof Error ? error.message : String(error)
  }

  if (authError) {
    console.error('Supabase admin API unavailable:', authError)
  }

  const rows = people.map((p) => {
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
      // ?? null, not ?? false — see the note on the field.
      emailConfirmed: authById.get(p.id)?.confirmed ?? null,
    }
  })

  return { people: rows, authError }
}

export type AuditEntry = {
  id: number
  at: string
  /**
   * 'System' when no signed-in person was responsible — a webhook, or an
   * account since deleted. That is information, not a missing value.
   */
  actor: string
  action: string
  entity: string
  entityId: string | null
  detail: Record<string, unknown> | null
}

/**
 * The audit trail, newest first.
 *
 * Written entirely by triggers, so this reflects what happened to the data
 * rather than what this application remembered to record. list_audit_log()
 * raises for a non-admin instead of returning fewer rows.
 */
export async function listAuditLog(limit = 200): Promise<AuditEntry[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_audit_log', { limit_to: limit })
  if (error) {
    console.error('list_audit_log failed:', error.message)
    return []
  }

  return (
    (data ?? []) as {
      a_id: number
      a_at: string
      actor_name: string
      a_action: string
      a_entity: string
      a_entity_id: string | null
      a_detail: Record<string, unknown> | null
    }[]
  ).map((r) => ({
    id: r.a_id,
    at: r.a_at,
    actor: r.actor_name,
    action: r.a_action,
    entity: r.a_entity,
    entityId: r.a_entity_id,
    detail: r.a_detail,
  }))
}
