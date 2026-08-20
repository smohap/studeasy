import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import type { Assessment, Certificate, PaperQuestion } from './assessment-types'

export type { Assessment, Certificate, PaperQuestion } from './assessment-types'

const ASSESSMENT_FIELDS =
  'id, title, description, course_id, time_limit_minutes, attempts_allowed, pass_mark_pct, negative_marking, issues_certificate, status'

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
