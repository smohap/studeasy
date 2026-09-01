import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import type { Assessment, Certificate, PaperQuestion } from './assessment-types'

export type { Assessment, Certificate, PaperQuestion } from './assessment-types'

const ASSESSMENT_FIELDS = `id, title, description, course_id, class_id, delivery,
   price_cents, currency, location, meeting_url, opens_at, closes_at, paper_url,
   paper_path, allow_upload, time_limit_minutes, attempts_allowed, pass_mark_pct,
   negative_marking, issues_certificate, status`

export type AssessmentAccess = {
  /** Entitled to sit it: free, bought, enrolled, or in the linked class. */
  canTake: boolean
  /** Inside the opens_at/closes_at window. */
  isOpen: boolean
}

/**
 * Whether the signed-in student may sit this, and whether the door is open.
 *
 * Two separate questions on purpose — merging them would make "you have not
 * paid for this" and "you are too late" the same message.
 */
export async function getAssessmentAccess(id: string): Promise<AssessmentAccess> {
  if (!isAuthConfigured) return { canTake: false, isOpen: false }
  const supabase = await createClient()

  const [{ data: canTake }, { data: isOpen }] = await Promise.all([
    supabase.rpc('can_take_assessment', { assessment: id }),
    supabase.rpc('assessment_is_open', { assessment: id }),
  ])

  return { canTake: Boolean(canTake), isOpen: Boolean(isOpen) }
}

/**
 * When an in-progress attempt must be finished by, as the server sees it.
 *
 * The countdown has to come from here rather than from the browser's own clock:
 * a client-side timer is reset by a reload, and the point of a timed assessment
 * is that it cannot be paused.
 */
export async function getAttemptDeadline(attemptId: string): Promise<string | null> {
  if (!isAuthConfigured) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('attempt_deadline', { attempt: attemptId })
  return (data as string | null) ?? null
}

export async function getAssessment(id: string): Promise<Assessment | null> {
  if (!isAuthConfigured) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('assessments')
    .select(ASSESSMENT_FIELDS)
    .eq('id', id)
    .maybeSingle()
  return (data as Assessment) ?? null
}

/**
 * The paper, without answers. Goes through get_paper() rather than selecting
 * from `questions`, because that table holds the correct answers and students
 * have no read policy on it at all.
 */
export async function getPaper(assessmentId: string): Promise<PaperQuestion[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_paper', { assessment: assessmentId })
  if (error) {
    console.error('get_paper failed:', error.message)
    return []
  }
  return (data ?? []) as PaperQuestion[]
}

export async function listAssessmentsForTeacher(): Promise<Assessment[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('assessments')
    .select(ASSESSMENT_FIELDS)
    .eq('teacher_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []) as Assessment[]
}

/** Assessments a student can sit, with how many attempts they have left. */
export async function listAssessmentsForStudent() {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data: assessments } = await supabase
    .from('assessments')
    .select(ASSESSMENT_FIELDS)
    .eq('status', 'published')

  const list = (assessments ?? []) as Assessment[]
  if (list.length === 0) return []

  const { data: attempts } = await supabase
    .from('attempts')
    .select('assessment_id, submitted_at, total_marks, passed, released')
    .eq('student_id', userId)

  const rows = (attempts ?? []) as {
    assessment_id: string
    submitted_at: string | null
    total_marks: number | null
    passed: boolean | null
    released: boolean
  }[]

  return list.map((a) => {
    const mine = rows.filter((r) => r.assessment_id === a.id)
    const done = mine.filter((r) => r.submitted_at)
    const best = done
      .filter((r) => r.released && r.total_marks != null)
      .sort((x, y) => (y.total_marks ?? 0) - (x.total_marks ?? 0))[0]
    return {
      assessment: a,
      attemptsUsed: done.length,
      attemptsLeft: Math.max(a.attempts_allowed - done.length, 0),
      bestMarks: best?.total_marks ?? null,
      passed: best?.passed ?? null,
      awaitingMarking: done.some((r) => !r.released),
    }
  })
}

export type WrittenAnswer = {
  id: string
  prompt: string
  marks: number
  response: string
  awarded: number | null
  comment: string | null
}

export type AttemptToMark = {
  id: string
  submittedAt: string
  autoMarks: number | null
  /** Closed by the sweep rather than handed in — a zero here was not earned. */
  autoClosed: boolean
  studentName: string
  assessmentTitle: string
  delivery: string
  uploadName: string | null
  /** Short-lived signed URL; the bucket is private. */
  uploadUrl: string | null
  written: WrittenAnswer[]
}

/**
 * Attempts waiting on a person: essays, offline uploads, classroom sittings.
 *
 * release_attempt() has existed since assessments were built and nothing ever
 * called it, so anything a machine could not mark stayed unmarked forever.
 * attempts_select narrows this to assessments the caller set.
 */
export async function getAttemptQueue(): Promise<AttemptToMark[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attempts')
    .select(
      `id, submitted_at, auto_marks, auto_closed, upload_path, upload_name,
       student:profiles!attempts_student_id_fkey(full_name),
       assessment:assessments(title, delivery)`,
    )
    .not('submitted_at', 'is', null)
    .eq('released', false)
    .order('submitted_at', { ascending: true })

  if (error) {
    console.error('Attempt queue failed:', error.message)
    return []
  }

  type Row = {
    id: string
    submitted_at: string
    auto_marks: number | null
    auto_closed: boolean
    upload_path: string | null
    upload_name: string | null
    student: { full_name: string | null } | null
    assessment: { title: string; delivery: string } | null
  }

  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) return []

  // The written ones are those the auto-marker left alone: auto_correct null.
  const { data: answerRows } = await supabase
    .from('answers')
    .select(
      'id, attempt_id, response, awarded_marks, teacher_comment, question:questions(prompt, marks)',
    )
    .in(
      'attempt_id',
      rows.map((r) => r.id),
    )
    .is('auto_correct', null)

  const answers = (answerRows ?? []) as unknown as {
    id: string
    attempt_id: string
    response: unknown
    awarded_marks: number | null
    teacher_comment: string | null
    question: { prompt: string; marks: number } | null
  }[]

  return Promise.all(
    rows.map(async (r) => {
      let uploadUrl: string | null = null
      if (r.upload_path) {
        // The bucket is private, so a link is only useful signed. An hour is
        // long enough to mark a paper and short enough not to leak.
        const { data: signed } = await supabase.storage
          .from('assessment-uploads')
          .createSignedUrl(r.upload_path, 60 * 60)
        uploadUrl = signed?.signedUrl ?? null
      }

      return {
        id: r.id,
        submittedAt: r.submitted_at,
        autoMarks: r.auto_marks,
        autoClosed: r.auto_closed,
        studentName: r.student?.full_name ?? 'Student',
        assessmentTitle: r.assessment?.title ?? 'Assessment',
        delivery: r.assessment?.delivery ?? 'online',
        uploadName: r.upload_name,
        uploadUrl,
        written: answers
          .filter((a) => a.attempt_id === r.id)
          .map((a) => ({
            id: a.id,
            prompt: a.question?.prompt ?? 'Question',
            marks: a.question?.marks ?? 0,
            response:
              typeof a.response === 'string'
                ? a.response
                : a.response == null
                  ? '(left blank)'
                  : JSON.stringify(a.response),
            awarded: a.awarded_marks,
            comment: a.teacher_comment,
          })),
      }
    }),
  )
}

export async function getMyCertificates(): Promise<Certificate[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('certificates')
    .select('id, title, serial, issued_at')
    .eq('student_id', userId)
    .order('issued_at', { ascending: false })
  return (data ?? []) as Certificate[]
}

/** XP and streaks, which touch_streak() has been recording all along. */
export async function getGamification() {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('gamification')
    .select('xp, level, streak_days, longest_streak')
    .eq('profile_id', userId)
    .maybeSingle()

  return (
    (data as {
      xp: number
      level: number
      streak_days: number
      longest_streak: number
    } | null) ?? null
  )
}
