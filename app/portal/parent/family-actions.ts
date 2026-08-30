'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Result = { error: string | null }

/**
 * Removes a child from this parent's account.
 *
 * unlink_student() decides whether the caller is entitled to — parent, student
 * or admin — so nothing is enforced here. It also withdraws any pending
 * request between the two, otherwise removing a child would leave a live
 * request sitting there ready to put them straight back.
 */
export async function removeChild(studentId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('unlink_student', { student: studentId })
  if (error) return { error: error.message }

  revalidatePath('/portal/parent')
  revalidatePath('/portal/parent/reports')
  revalidatePath('/portal/student')
  return { error: null }
}
