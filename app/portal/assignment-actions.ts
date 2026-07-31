'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

export type Result = { error: string | null }

/** A student hands work in. Text note only for now — file upload needs Storage. */
export async function submitAssignment(
  assignmentId: string,
  note: string,
): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }
  if (!note.trim()) return { error: 'Write something, or attach your work.' }

  const supabase = await createClient()
  const { error } = await supabase.from('submissions').upsert(
    {
      assignment_id: assignmentId,
      student_id: userId,
      note: note.trim(),
      submitted_at: new Date().toISOString(),
    },
    { onConflict: 'assignment_id,student_id' },
  )

  if (error) return { error: error.message }

  // Handing work in counts as activity for the streak.
  await supabase.rpc('touch_streak', { award_xp: 25 })

  revalidatePath('/portal/student/assignments')
  return { error: null }
}

/**
 * Teacher grades and releases. The database checks they own the course and
 * that the mark is inside the assignment's range.
 */
export async function gradeSubmission(
  submissionId: string,
  marks: number,
  feedback: string,
  release: boolean,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('grade_submission', {
    submission: submissionId,
    awarded: marks,
    comment: feedback,
    release,
  })

  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/marking')
  revalidatePath('/portal/student/assignments')
  return { error: null }
}
