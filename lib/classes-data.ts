import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import type {
  ClassMaterial,
  ClassRegistration,
  ClassSession,
  ClassWithStanding,
  ForumReply,
  ForumTopic,
} from './class-types'

export type * from './class-types'

const CLASS_FIELDS =
  'id, teacher_id, teacher_name, title, subject, year_level, topics, mode, location, meeting_url, starts_at, ends_at, capacity, waitlist_cap, price_cents, currency, status, refund_full_hours, refund_partial_hours, refund_partial_pct, materials_days'

/** Same fields plus the code — only select this where the caller is entitled to it. */
const CLASS_FIELDS_WITH_CODE = `${CLASS_FIELDS}, access_code`

const REGISTRATION_FIELDS =
  'id, class_id, student_id, status, waitlist_position, offer_expires_at, paid, amount_paid_cents, refund_cents, refund_reason, attendance, code_entered_at'

/** Everything a student could register for, soonest first. */
export async function listOpenClasses(filter?: {
  subject?: string
  q?: string
}): Promise<ClassSession[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  let query = supabase
    .from('class_sessions')
    .select(CLASS_FIELDS)
    .in('status', ['published', 'in_progress'])
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  if (filter?.subject) query = query.eq('subject', filter.subject)
  if (filter?.q) {
    query = query.or(
      `title.ilike.%${filter.q}%,topics.ilike.%${filter.q}%,teacher_name.ilike.%${filter.q}%`,
    )
  }

  const { data } = await query
  return (data ?? []) as ClassSession[]
}

export async function getClassSession(id: string): Promise<ClassSession | null> {
  if (!isAuthConfigured) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_sessions')
    .select(CLASS_FIELDS_WITH_CODE)
    .eq('id', id)
    .maybeSingle()
  return (data as ClassSession) ?? null
}

/** How full a class is. */
export async function getClassCounts(
  classId: string,
): Promise<{ taken: number; waitlisted: number }> {
  if (!isAuthConfigured) return { taken: 0, waitlisted: 0 }
  const supabase = await createClient()

  const [{ count: taken }, { count: waitlisted }] = await Promise.all([
    supabase
      .from('class_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .in('status', ['confirmed', 'offered']),
    supabase
      .from('class_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'waitlisted'),
  ])

  return { taken: taken ?? 0, waitlisted: waitlisted ?? 0 }
}

export async function getMyRegistration(
  classId: string,
): Promise<ClassRegistration | null> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('class_registrations')
    .select(REGISTRATION_FIELDS)
    .eq('class_id', classId)
    .eq('student_id', userId)
    .maybeSingle()
  return (data as ClassRegistration) ?? null
}

/**
 * The student's own classes. Cancelled registrations are left out — they are
 * history, and the class is still browsable if the student changes their mind.
 */
export async function listMyClasses(): Promise<ClassWithStanding[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data: regs } = await supabase
    .from('class_registrations')
    .select(REGISTRATION_FIELDS)
    .eq('student_id', userId)
    .neq('status', 'cancelled')

  const registrations = (regs ?? []) as ClassRegistration[]
  if (registrations.length === 0) return []

  const { data: sessions } = await supabase
    .from('class_sessions')
    .select(CLASS_FIELDS_WITH_CODE)
    .in(
      'id',
      registrations.map((r) => r.class_id),
    )
    .order('starts_at', { ascending: true })

  const list = (sessions ?? []) as ClassSession[]

  return Promise.all(
    list.map(async (session) => {
      const counts = await getClassCounts(session.id)
      const registration = registrations.find((r) => r.class_id === session.id) ?? null
      return {
        session: {
          ...session,
          // The code is the key to the room; only a held seat earns it.
          access_code: registration?.status === 'confirmed' ? session.access_code : null,
        },
        registration,
        seatsLeft: Math.max(session.capacity - counts.taken, 0),
        waitlistLength: counts.waitlisted,
      }
    }),
  )
}

export async function listClassesForTeacher(): Promise<ClassWithStanding[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('class_sessions')
    .select(CLASS_FIELDS_WITH_CODE)
    .eq('teacher_id', userId)
    .order('starts_at', { ascending: true })

  const list = (data ?? []) as ClassSession[]

  return Promise.all(
    list.map(async (session) => {
      const counts = await getClassCounts(session.id)
      return {
        session,
        registration: null,
        seatsLeft: Math.max(session.capacity - counts.taken, 0),
        waitlistLength: counts.waitlisted,
      }
    }),
  )
}

export type RosterEntry = {
  registration: ClassRegistration
  name: string
  email: string | null
  studentCode: string | null
}

/** The roster, with names, for the teacher's register and attendance sheet. */
export async function getRoster(classId: string): Promise<RosterEntry[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const { data } = await supabase
    .from('class_registrations')
    .select(REGISTRATION_FIELDS)
    .eq('class_id', classId)
    .neq('status', 'cancelled')
    .order('waitlist_position', { ascending: true, nullsFirst: true })

  const rows = (data ?? []) as ClassRegistration[]
  if (rows.length === 0) return []

  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name, email, student_code')
    .in(
      'id',
      rows.map((r) => r.student_id),
    )

  const byId = new Map(
    (
      (people ?? []) as {
        id: string
        full_name: string | null
        email: string | null
        student_code: string | null
      }[]
    ).map((p) => [p.id, p]),
  )

  return rows.map((r) => ({
    registration: r,
    name: byId.get(r.student_id)?.full_name ?? 'Student',
    email: byId.get(r.student_id)?.email ?? null,
    studentCode: byId.get(r.student_id)?.student_code ?? null,
  }))
}

/**
 * Materials for a class.
 *
 * Returns nothing unless the caller passes the policy on class_materials — the
 * filtering is the database's, not ours. An empty list means "not started yet",
 * "window expired", or "code not entered", and the page explains which.
 */
export async function listClassMaterials(classId: string): Promise<ClassMaterial[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_materials')
    .select(
      'id, class_id, title, description, kind, external_url, body, available_from, available_until, created_at',
    )
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  return (data ?? []) as ClassMaterial[]
}

// ---------------------------------------------------------------------------
// Forums
// ---------------------------------------------------------------------------

const TOPIC_FIELDS =
  'id, scope, class_id, author_id, title, body, subject, status, accepted_reply_id, reply_count, created_at'

/** Attaches display names, which the forum rows themselves do not carry. */
async function withAuthors<T extends { author_id: string | null }>(
  rows: T[],
): Promise<(T & { author_name: string | null; author_role: string | null })[]> {
  if (rows.length === 0) return []
  const supabase = await createClient()

  const ids = [...new Set(rows.map((r) => r.author_id).filter(Boolean))] as string[]
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, author_name: 'Removed', author_role: null }))
  }

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', ids)

  const byId = new Map(
    ((data ?? []) as { id: string; full_name: string | null; role: string | null }[]).map(
      (p) => [p.id, p],
    ),
  )

  return rows.map((r) => ({
    ...r,
    author_name: r.author_id ? (byId.get(r.author_id)?.full_name ?? 'Member') : 'Removed',
    author_role: r.author_id ? (byId.get(r.author_id)?.role ?? null) : null,
  }))
}

export async function listGeneralTopics(filter?: {
  subject?: string
  q?: string
}): Promise<ForumTopic[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  let query = supabase
    .from('forum_topics')
    .select(TOPIC_FIELDS)
    .eq('scope', 'general')
    .order('created_at', { ascending: false })
    .limit(60)

  if (filter?.subject) query = query.eq('subject', filter.subject)
  if (filter?.q) query = query.or(`title.ilike.%${filter.q}%,body.ilike.%${filter.q}%`)

  const { data } = await query
  return withAuthors((data ?? []) as ForumTopic[])
}

export async function listClassTopics(classId: string): Promise<ForumTopic[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('forum_topics')
    .select(TOPIC_FIELDS)
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  return withAuthors((data ?? []) as ForumTopic[])
}

export async function getTopic(id: string): Promise<ForumTopic | null> {
  if (!isAuthConfigured) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('forum_topics')
    .select(TOPIC_FIELDS)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const [enriched] = await withAuthors([data as ForumTopic])
  return enriched
}

export async function listReplies(topicId: string): Promise<ForumReply[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('forum_replies')
    .select('id, topic_id, author_id, body, created_at')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true })
  return withAuthors((data ?? []) as ForumReply[])
}
