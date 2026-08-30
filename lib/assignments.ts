import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

/** An assignment hangs off a course or a scheduled class — never neither. */
export type AssignmentParent = { id: string; title: string } | null

export type StudentAssignment = {
  id: string
  title: string
  instructions: string | null
  due_at: string | null
  max_marks: number
  allow_late: boolean
  course: { id: string; title: string; slug: string } | null
  /** Aliased: `class` is a reserved word, and `a.class` reads badly. */
  klass: AssignmentParent
  submission: {
    id: string
    submitted_at: string
    note: string | null
    marks: number | null
    feedback: string | null
    released: boolean
  } | null
}

export type TeacherAssignment = {
  id: string
  title: string
  instructions: string | null
  due_at: string | null
  max_marks: number
  allow_late: boolean
  status: 'draft' | 'published' | 'archived'
  course_id: string | null
  class_id: string | null
  course: AssignmentParent
  klass: AssignmentParent
  submissionCount: number
  ungradedCount: number
}

export type MarkingRow = {
  id: string
  submitted_at: string
  note: string | null
  marks: number | null
  feedback: string | null
  released: boolean
  ai_marks: number | null
  ai_feedback: string | null
  student: { id: string; full_name: string | null } | null
  assignment: { id: string; title: string; max_marks: number } | null
}

/**
 * Assignments on the courses this student is enrolled in, and on the classes
 * they hold a seat in. Which of the two is decided by assignments_select, not
 * here — this asks for everything published and lets the policy answer.
 */
export async function getStudentAssignments(): Promise<StudentAssignment[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .select(
      `id, title, instructions, due_at, max_marks, allow_late,
       course:courses(id, title, slug),
       klass:class_sessions(id, title),
       submission:submissions(id, submitted_at, note, marks, feedback, released)`,
    )
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('due_at', { ascending: true })

  if (error) {
    console.error('Assignments query failed:', error.message)
    return []
  }

  // RLS returns only this student's submission row, but the embed is an array.
  return (
    (data ?? []) as unknown as (Omit<StudentAssignment, 'submission'> & {
      submission: StudentAssignment['submission'][] | StudentAssignment['submission']
    })[]
  ).map((a) => ({
    ...a,
    submission: Array.isArray(a.submission) ? (a.submission[0] ?? null) : a.submission,
  }))
}

/**
 * What this teacher has set, with how much of it is waiting to be marked.
 *
 * No teacher_id filter: assignments_select already returns exactly the ones
 * they own, and filtering on teacher_id would hide an assignment set against a
 * class they took over from someone else.
 */
export async function getTeacherAssignments(): Promise<TeacherAssignment[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .select(
      `id, title, instructions, due_at, max_marks, allow_late, status, course_id, class_id,
       course:courses(id, title),
       klass:class_sessions(id, title)`,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Teacher assignments query failed:', error.message)
    return []
  }

  const rows = (data ?? []) as unknown as Omit<
    TeacherAssignment,
    'submissionCount' | 'ungradedCount'
  >[]
  if (rows.length === 0) return []

  // One query for every assignment's submissions, counted in memory — cheaper
  // than a head-count round trip per row.
  const { data: subs } = await supabase
    .from('submissions')
    .select('assignment_id, graded_at')
    .in(
      'assignment_id',
      rows.map((r) => r.id),
    )

  const submissions = (subs ?? []) as { assignment_id: string; graded_at: string | null }[]

  return rows.map((r) => {
    const mine = submissions.filter((s) => s.assignment_id === r.id)
    return {
      ...r,
      submissionCount: mine.length,
      ungradedCount: mine.filter((s) => !s.graded_at).length,
    }
  })
}

/** Everything waiting on this teacher, newest last so the queue reads as a queue. */
export async function getMarkingQueue(): Promise<MarkingRow[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select(
      `id, submitted_at, note, marks, feedback, released, ai_marks, ai_feedback,
       student:profiles!submissions_student_id_fkey(id, full_name),
       assignment:assignments(id, title, max_marks)`,
    )
    .order('submitted_at', { ascending: true })

  if (error) {
    console.error('Marking queue failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as MarkingRow[]
}
