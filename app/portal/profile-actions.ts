'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { AccountStatus, Role } from '@/lib/roles'

export type Result = { error: string | null }

export type ProfileEdit = {
  fullName: string
  yearLevel: string
  subjects: string[]
  teachingSubjects: string[]
}

/**
 * Update your own details.
 *
 * Only the four descriptive columns. guard_profile() pins role, status,
 * approved_at/by, student_code and parent_id against self-service writes, so
 * even if this sent them the database would put them straight back — but
 * sending only what may legitimately change keeps the intent obvious.
 */
export async function updateProfile(input: ProfileEdit): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }
  if (!input.fullName.trim()) return { error: 'Your name cannot be blank.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName.trim(),
      year_level: input.yearLevel.trim() || null,
      subjects: input.subjects.map((s) => s.trim()).filter(Boolean),
      teaching_subjects: input.teachingSubjects.map((s) => s.trim()).filter(Boolean),
    })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/portal/profile')
  revalidatePath('/portal', 'layout')
  return { error: null }
}

/**
 * Claim another role on the account you already have.
 *
 * request_role() decides the outcome: tutor lands 'pending' because teaching is
 * approved by an administrator, everything else is active straight away, and
 * admin is refused outright — that one only ever comes from the allowlist.
 */
export async function claimRole(role: Role): Promise<Result & { status?: AccountStatus }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('request_role', { wanted: role })
  if (error) return { error: error.message }

  revalidatePath('/portal/profile')
  revalidatePath('/portal', 'layout')
  return { error: null, status: data as AccountStatus }
}
