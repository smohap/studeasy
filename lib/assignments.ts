import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

export type StudentAssignment = {
  id: string
  title: string
  instructions: string | null
  due_at: string | null
  max_marks: number
  allow_late: boolean
  course: { id: string; title: string; slug: string } | null
  submission: {
    id: string
    submitted_at: string
    note: string | null
    marks: number | null
    feedback: string | null
    released: boolean
  } | null
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

/** Assignments on the courses this student is enrolled in. */
export async function getStudentAssignments(): Promise<StudentAssignment[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .select(
      `id, title, instructions, due_at, max_marks, allow_late,
       course:courses(id, title, slug),
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
  return ((data ?? []) as unknown as (Omit<StudentAssignment, 'submission'> & {
    submission: StudentAssignment['submission'][] | StudentAssignment['submission']
  })[]).map((a) => ({
    ...a,
    submission: Array.isArray(a.submission) ? (a.submission[0] ?? null) : a.submission,
  }))
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
