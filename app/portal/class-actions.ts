'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type {
  ClassMode,
  ClassStatus,
  MaterialKind,
  RegisterOutcome,
} from '@/lib/class-types'

export type Result = { error: string | null }

// ---------------------------------------------------------------------------
// Registering
// ---------------------------------------------------------------------------

/**
 * Take a seat, a place on the waiting list, or neither.
 *
 * All the counting happens inside register_for_class() under a row lock, so two
 * students clicking at the same instant cannot both take the last seat. This
 * only relays what it decided.
 */
export async function registerForClass(
  classId: string,
): Promise<Result & { outcome?: RegisterOutcome }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('register_for_class', { class: classId })
  if (error) return { error: error.message }

  revalidatePath('/classes')
  revalidatePath(`/classes/${classId}`)
  revalidatePath('/portal/student/classes')

  return { error: null, outcome: (data as RegisterOutcome[])[0] }
}

export async function cancelClassRegistration(
  classId: string,
): Promise<Result & { refundCents?: number; refundReason?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_class_registration', {
    class: classId,
  })
  if (error) return { error: error.message }

  const row = (data as { refund_cents: number; refund_reason: string }[])[0]

  revalidatePath('/classes')
  revalidatePath(`/classes/${classId}`)
  revalidatePath('/portal/student/classes')

  return { error: null, refundCents: row?.refund_cents, refundReason: row?.refund_reason }
}

/** Unlocks materials and the class forum. */
export async function enterClass(code: string): Promise<Result & { classId?: string }> {
  if (!code.trim()) return { error: 'Enter the code from your registration.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('enter_class', { code: code.trim() })
  if (error) return { error: error.message }

  const classId = data as string
  revalidatePath(`/classes/${classId}`)
  return { error: null, classId }
}

// ---------------------------------------------------------------------------
// Teaching
// ---------------------------------------------------------------------------

export type NewClass = {
  title: string
  subject: string
  yearLevel: string
  topics: string
  mode: ClassMode
  location: string
  meetingUrl: string
  /** Both come from datetime-local inputs, i.e. local wall time, no zone. */
  startsAt: string
  endsAt: string
  capacity: string
  waitlistCap: string
  priceDollars: string
  refundFullHours: string
  refundPartialHours: string
  refundPartialPct: string
  materialsDays: string
}

export async function createClassSession(input: NewClass): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  if (!userId || profile?.role !== 'tutor') {
    return { error: 'Only a teacher can schedule a class.' }
  }
  if (profile.status !== 'active') {
    return { error: 'Your tutor account is still awaiting approval.' }
  }
  if (!input.title.trim()) return { error: 'Give the class a title.' }
  if (!input.subject.trim()) return { error: 'Pick a subject.' }
  if (!input.startsAt || !input.endsAt) return { error: 'Set a start and end time.' }
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    return { error: 'The class has to finish after it starts.' }
  }

  const capacity = Number(input.capacity || '0')
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { error: 'How many students can attend? Enter 1 or more.' }
  }

  const waitlistCap = Number(input.waitlistCap || '10')
  if (waitlistCap < 0 || waitlistCap > 10) {
    return { error: 'The waiting list can hold between 0 and 10 students.' }
  }

  // Money is entered in dollars and stored in cents; rounding here keeps a
  // stray "49.999" from becoming an un-chargeable amount.
  const priceCents = Math.round(Number(input.priceDollars || '0') * 100)
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return { error: 'Enter a price of 0 or more.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('class_sessions').insert({
    organization_id: profile.organization_id,
    teacher_id: userId,
    teacher_name: profile.full_name ?? 'StudEasy tutor',
    title: input.title.trim(),
    subject: input.subject.trim(),
    year_level: input.yearLevel.trim() || null,
    topics: input.topics.trim() || null,
    mode: input.mode,
    location: input.location.trim() || null,
    meeting_url: input.meetingUrl.trim() || null,
    starts_at: new Date(input.startsAt).toISOString(),
    ends_at: new Date(input.endsAt).toISOString(),
    capacity,
    waitlist_cap: waitlistCap,
    price_cents: priceCents,
    refund_full_hours: Number(input.refundFullHours || '48'),
    refund_partial_hours: Number(input.refundPartialHours || '12'),
    refund_partial_pct: Number(input.refundPartialPct || '50'),
    materials_days: Number(input.materialsDays || '14'),
    status: 'draft',
  })

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/classes')
  return { error: null }
}

export async function setClassStatus(
  classId: string,
  status: ClassStatus,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('class_sessions')
    .update({ status })
    .eq('id', classId)

  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/classes')
  revalidatePath('/classes')
  revalidatePath(`/classes/${classId}`)
  return { error: null }
}

export type NewMaterial = {
  classId: string
  title: string
  description: string
  kind: MaterialKind
  externalUrl: string
  body: string
  /** Blank means "as soon as the class starts" and "materials_days after it ends". */
  availableFrom: string
  availableUntil: string
}

export async function addClassMaterial(input: NewMaterial): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!input.title.trim()) return { error: 'Give the material a title.' }
  if (!input.externalUrl.trim() && !input.body.trim()) {
    return { error: 'Add a link or some text — otherwise there is nothing to open.' }
  }

  const supabase = await createClient()

  // Defaults come from the class, so the teacher only sets a window when they
  // want something other than "for the run of the class".
  const { data: session } = await supabase
    .from('class_sessions')
    .select('starts_at, ends_at, materials_days')
    .eq('id', input.classId)
    .maybeSingle()

  const s = session as {
    starts_at: string
    ends_at: string
    materials_days: number
  } | null

  const defaultUntil = s
    ? new Date(new Date(s.ends_at).getTime() + s.materials_days * 86_400_000).toISOString()
    : null

  const { error } = await supabase.from('class_materials').insert({
    organization_id: profile?.organization_id,
    class_id: input.classId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    kind: input.kind,
    external_url: input.externalUrl.trim() || null,
    body: input.body.trim() || null,
    available_from: input.availableFrom
      ? new Date(input.availableFrom).toISOString()
      : (s?.starts_at ?? null),
    available_until: input.availableUntil
      ? new Date(input.availableUntil).toISOString()
      : defaultUntil,
  })

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/classes')
  revalidatePath(`/classes/${input.classId}`)
  return { error: null }
}

export async function removeClassMaterial(
  materialId: string,
  classId: string,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('class_materials')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', materialId)

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/classes')
  revalidatePath(`/classes/${classId}`)
  return { error: null }
}

export async function markAttendance(
  classId: string,
  studentId: string,
  state: 'present' | 'late' | 'absent',
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_class_attendance', {
    class: classId,
    student: studentId,
    state,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/classes')
  return { error: null }
}

// ---------------------------------------------------------------------------
// Forums
// ---------------------------------------------------------------------------

export async function postTopic(input: {
  title: string
  body: string
  subject?: string
  /** Omit for the general forum. */
  classId?: string
}): Promise<Result & { topicId?: string }> {
  const { userId, profile } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to post.' }
  if (!input.title.trim()) return { error: 'Give your question a title.' }
  if (!input.body.trim()) return { error: 'Describe what you need help with.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forum_topics')
    .insert({
      organization_id: profile?.organization_id,
      scope: input.classId ? 'class' : 'general',
      class_id: input.classId ?? null,
      author_id: userId,
      title: input.title.trim(),
      body: input.body.trim(),
      subject: input.subject?.trim() || null,
    })
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }

  if (input.classId) revalidatePath(`/classes/${input.classId}`)
  else revalidatePath('/forum')

  return { error: null, topicId: (data as { id: string } | null)?.id }
}

export async function postReply(topicId: string, body: string): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to reply.' }
  if (!body.trim()) return { error: 'Write a reply first.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('forum_replies')
    .insert({ topic_id: topicId, author_id: userId, body: body.trim() })

  if (error) return { error: error.message }
  revalidatePath(`/forum/${topicId}`)
  return { error: null }
}

/** Marks one reply as the answer. The asker or a teacher decides. */
export async function acceptReply(replyId: string, topicId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_forum_reply', { reply: replyId })
  if (error) return { error: error.message }

  revalidatePath(`/forum/${topicId}`)
  return { error: null }
}

/**
 * Flags a post for a moderator. Anyone can do this, and it hides nothing by
 * itself — a student should not be able to silence a question by reporting it,
 * but they should always be able to raise a concern.
 */
export async function reportPost(input: {
  topicId?: string
  replyId?: string
  reason: string
}): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to report a post.' }
  if (!input.reason.trim()) return { error: 'Tell us what is wrong with it.' }

  const supabase = await createClient()
  const { error } = await supabase.from('forum_reports').insert({
    topic_id: input.topicId ?? null,
    reply_id: input.replyId ?? null,
    reporter_id: userId,
    reason: input.reason.trim(),
  })

  if (error) return { error: error.message }
  return { error: null }
}
