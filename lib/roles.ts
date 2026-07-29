export const ROLES = ['student', 'parent', 'tutor', 'admin'] as const
export type Role = (typeof ROLES)[number]

export type AccountStatus = 'active' | 'pending' | 'rejected'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: Role | null
  status: AccountStatus
  student_code: string | null
  year_level: string | null
  subjects: string[]
  teaching_subjects: string[]
  parent_id: string | null
}

/**
 * The three roles an account may claim for itself. `admin` is absent on
 * purpose — it is granted server-side from an allowlist.
 */
export const SELECTABLE_ROLES = [
  {
    value: 'student' as const,
    label: 'Student',
    blurb: 'I am sitting NCEA or Cambridge and want help with Maths or Science.',
  },
  {
    value: 'parent' as const,
    label: 'Parent or caregiver',
    blurb: "I am paying for my child's lessons and want to follow their progress.",
  },
  {
    value: 'tutor' as const,
    label: 'Tutor',
    blurb: 'I teach for StudEasy. My account needs approving before I can start.',
  },
]

export type SelectableRole = (typeof SELECTABLE_ROLES)[number]['value']

export function isSelectableRole(v: unknown): v is SelectableRole {
  return v === 'student' || v === 'parent' || v === 'tutor'
}

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v)
}

export const ROLE_HOME: Record<Role, string> = {
  student: '/portal/student',
  parent: '/portal/parent',
  tutor: '/portal/tutor',
  admin: '/portal/admin',
}

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  parent: 'Parent',
  tutor: 'Tutor',
  admin: 'Administrator',
}

/** Where a signed-in account belongs right now. */
export function destinationFor(profile: Profile | null): string {
  if (!profile || !profile.role) return '/register/complete'
  if (profile.role === 'tutor' && profile.status !== 'active') return '/portal/tutor'
  return ROLE_HOME[profile.role]
}
