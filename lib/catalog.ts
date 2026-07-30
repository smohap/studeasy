export type CourseKind = 'course' | 'class' | 'bundle' | 'test'
export type CourseFormat = 'online' | 'in_person' | 'hybrid' | 'self_paced'
export type CourseStatus = 'draft' | 'pending_review' | 'published' | 'archived'

export type Course = {
  id: string
  slug: string
  title: string
  subject: string
  level: string | null
  summary: string | null
  description: string | null
  emoji: string | null
  teacher_name: string
  teacher_id: string | null
  kind: CourseKind
  format: CourseFormat
  price_cents: number
  currency: string
  seats: number | null
  status: CourseStatus
  rating_avg: number | null
  rating_count: number
}

export const COURSE_FIELDS =
  'id, slug, title, subject, level, summary, description, emoji, teacher_name, teacher_id, kind, format, price_cents, currency, seats, status, rating_avg, rating_count'

export const KIND_LABEL: Record<CourseKind, string> = {
  course: 'Course',
  class: 'Class',
  bundle: 'Bundle',
  test: 'Assessment',
}

export const FORMAT_LABEL: Record<CourseFormat, string> = {
  online: 'Online',
  in_person: 'In person',
  hybrid: 'Online or in person',
  self_paced: 'Self-paced',
}

export const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: 'Draft',
  pending_review: 'Awaiting approval',
  published: 'Published',
  archived: 'Archived',
}

/** Prices are stored in cents so nothing depends on float arithmetic. */
export function formatPrice(cents: number, currency = 'NZD'): string {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

export const SUBJECT_FILTERS = [
  'All subjects',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Statistics',
  'Calculus',
]
