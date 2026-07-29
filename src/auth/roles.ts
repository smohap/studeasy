/**
 * Roles a person can hold. `admin` is deliberately absent from the
 * self-selectable set: it is granted server-side from an allowlist, never
 * chosen at registration.
 */
export const ROLES = ['student', 'parent', 'tutor', 'admin'] as const

export type Role = (typeof ROLES)[number]

/** The three roles a new account may choose for itself. */
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
    blurb: 'I teach for StudEasy and need my schedule, planning and marking.',
  },
]

export type SelectableRole = (typeof SELECTABLE_ROLES)[number]['value']

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
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
