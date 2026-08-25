/**
 * Types for scheduled classes and the forums.
 *
 * Separate from classes-data.ts because that module imports next/headers, which
 * cannot be pulled into a client bundle. Client components import from here.
 */

export type ClassMode = 'online' | 'classroom' | 'hybrid'

export type ClassStatus =
  | 'draft'
  | 'published'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type ClassSession = {
  id: string
  teacher_id: string | null
  teacher_name: string
  title: string
  subject: string
  year_level: string | null
  topics: string | null
  mode: ClassMode
  location: string | null
  meeting_url: string | null
  starts_at: string
  ends_at: string
  capacity: number
  waitlist_cap: number
  price_cents: number
  currency: string
  status: ClassStatus
  /** Only ever sent to the teacher, an admin, or a student holding a seat. */
  access_code?: string | null
  refund_full_hours: number
  refund_partial_hours: number
  refund_partial_pct: number
  materials_days: number
}

export type RegistrationStatus = 'confirmed' | 'offered' | 'waitlisted' | 'cancelled'

export type ClassRegistration = {
  id: string
  class_id: string
  student_id: string
  status: RegistrationStatus
  waitlist_position: number | null
  offer_expires_at: string | null
  paid: boolean
  amount_paid_cents: number
  refund_cents: number | null
  refund_reason: string | null
  attendance: 'present' | 'late' | 'absent' | null
  code_entered_at: string | null
}

/** A class as a student sees it: the class plus their own standing in it. */
export type ClassWithStanding = {
  session: ClassSession
  registration: ClassRegistration | null
  seatsLeft: number
  waitlistLength: number
}

export type MaterialKind = 'document' | 'video' | 'link' | 'notes' | 'assignment'

export type ClassMaterial = {
  id: string
  class_id: string
  title: string
  description: string | null
  kind: MaterialKind
  external_url: string | null
  body: string | null
  available_from: string | null
  available_until: string | null
  created_at: string
}

export type ForumScope = 'general' | 'class'

export type ForumTopic = {
  id: string
  scope: ForumScope
  class_id: string | null
  author_id: string | null
  author_name?: string | null
  author_role?: string | null
  title: string
  body: string
  subject: string | null
  status: 'open' | 'answered' | 'closed' | 'hidden'
  accepted_reply_id: string | null
  reply_count: number
  created_at: string
}

export type ForumReply = {
  id: string
  topic_id: string
  author_id: string | null
  author_name?: string | null
  author_role?: string | null
  body: string
  created_at: string
}

/** What register_for_class() reports back. */
export type RegisterOutcome = {
  outcome: RegistrationStatus
  position: number | null
  amount_due_cents: number
  access_code: string | null
}

export const CLASS_MODE_LABEL: Record<ClassMode, string> = {
  online: 'Online',
  classroom: 'In the classroom',
  hybrid: 'Online or in person',
}

export const CLASS_STATUS_LABEL: Record<ClassStatus, string> = {
  draft: 'Draft',
  published: 'Open for registration',
  in_progress: 'In progress',
  completed: 'Finished',
  cancelled: 'Cancelled',
}

export function formatMoney(cents: number, currency = 'NZD'): string {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

export function formatWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const day = new Intl.DateTimeFormat('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(start)
  const time = new Intl.DateTimeFormat('en-NZ', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${day}, ${time.format(start)}–${time.format(end)}`
}

/**
 * The refund a student would get if they cancelled right now. Mirrors the tiers
 * in cancel_class_registration() so the UI can warn before they commit — the
 * database is still the one that decides.
 */
export function refundPreview(
  session: ClassSession,
  paidCents: number,
): { cents: number; note: string } {
  if (paidCents === 0) return { cents: 0, note: 'Nothing to refund.' }

  const hours = (new Date(session.starts_at).getTime() - Date.now()) / 3_600_000

  if (hours >= session.refund_full_hours) {
    return { cents: paidCents, note: 'Full refund at this notice.' }
  }
  if (hours >= session.refund_partial_hours) {
    return {
      cents: Math.round((paidCents * session.refund_partial_pct) / 100),
      note: `${session.refund_partial_pct}% refund at this notice.`,
    }
  }
  return {
    cents: 0,
    note: `No refund inside ${session.refund_partial_hours} hours of the start.`,
  }
}
