'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { hasRole } from '@/lib/roles'

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

// ---------------------------------------------------------------------------
// Setting work
// ---------------------------------------------------------------------------

export type NewAssignment = {
  title: string
  instructions: string
  /** Exactly one parent: `course:<id>` or `class:<id>`, from a single select. */
  parent: string
  /** From a datetime-local input: local wall time, no zone. Blank for no due date. */
  dueAt: string
  maxMarks: string
  allowLate: boolean
}

export async function createAssignment(input: NewAssignment): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  // Membership, not the active role — see createClassSession() for why.
  if (!userId || !profile || !hasRole(profile, 'tutor')) {
    return {
      error: profile?.roles?.some((r) => r.role === 'tutor')
        ? 'Your tutor account is still awaiting approval.'
        : 'Only a teacher can set an assignment.',
    }
  }
  if (!input.title.trim()) return { error: 'Give the assignment a title.' }

  const [kind, id] = input.parent.split(':')
  if ((kind !== 'course' && kind !== 'class') || !id) {
    return { error: 'Choose the course or class this work belongs to.' }
  }

  const maxMarks = Number(input.maxMarks || '0')
  if (!Number.isInteger(maxMarks) || maxMarks < 1) {
    return { error: 'Marks available must be a whole number of 1 or more.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('assignments').insert({
    organization_id: profile.organization_id,
    teacher_id: userId,
    course_id: kind === 'course' ? id : null,
    class_id: kind === 'class' ? id : null,
    title: input.title.trim(),
    instructions: input.instructions.trim() || null,
    due_at: input.dueAt ? new Date(input.dueAt).toISOString() : null,
    max_marks: maxMarks,
    allow_late: input.allowLate,
    /*
     * Draft, so a half-written brief is not already in front of students. The
     * column's own default is 'published', which is the wrong way round for
     * anything created from a form.
     */
    status: 'draft',
  })

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/assignments')
  return { error: null }
}

export async function setAssignmentStatus(
  assignmentId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('assignments')
    .update({ status })
    .eq('id', assignmentId)

  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/assignments')
  revalidatePath('/portal/student/assignments')
  return { error: null }
}

/**
 * Soft delete. submissions cascades from the assignment row, so removing it
 * for real would take a student's marked work with it.
 */
export async function deleteAssignment(assignmentId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('assignments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', assignmentId)

  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/assignments')
  revalidatePath('/portal/student/assignments')
  return { error: null }
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

/**
 * Teacher grades and releases. The database checks they set this work — the
 * course's teacher or the class's — and that the mark is inside range.
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
