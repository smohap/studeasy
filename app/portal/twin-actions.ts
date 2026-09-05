'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

export type Result = { error: string | null }

/** Wraps review_projection(); the function checks the caller teaches them. */
export async function reviewProjection(
  studentId: string,
  topicId: string,
  note: string,
  release: boolean,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()

  const { error } = await supabase.rpc('review_projection', {
    student: studentId,
    topic: topicId,
    note,
    release,
  })
  if (error) return { error: error.message }

  revalidatePath(`/portal/tutor/students/${studentId}`)
  revalidatePath('/portal/parent')
  return { error: null }
}
