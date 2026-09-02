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

/**
 * The half of a profile the public site reads: a tutor's directory entry, and
 * a student's consent to appear in anonymised reporting.
 *
 * Deliberately a second action rather than more fields on updateProfile(). The
 * columns it writes are added by supabase/public-site.sql, which is newer than
 * the rest of the schema — keeping them out of the main update means a build
 * running against a database where that file has not been applied still saves
 * a name and a year level, and only this panel reports a problem.
 */
export type PublicProfileEdit = {
  headline: string
  bio: string
  qualifications: string
  yearsExperience: string
  listed: boolean
}

export async function updatePublicProfile(
  input: PublicProfileEdit,
): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }

  const years = input.yearsExperience.trim()
  let parsedYears: number | null = null
  if (years) {
    const n = Number(years)
    if (!Number.isInteger(n) || n < 0 || n > 70) {
      return { error: 'Years teaching must be a whole number between 0 and 70.' }
    }
    parsedYears = n
  }

  if (input.headline.length > 160) {
    return { error: 'Keep the headline under 160 characters.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      headline: input.headline.trim() || null,
      bio: input.bio.trim() || null,
      qualifications: input.qualifications.trim() || null,
      years_experience: parsedYears,
      listed: input.listed,
    })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/portal/profile')
  revalidatePath('/tutors')
  return { error: null }
}

/**
 * Opt in or out of anonymised progress reporting on /success-stories.
 *
 * Default is off, and this is the only thing that turns it on. Turning it off
 * removes the account's figures from the public page on the next request —
 * public_progress_stories() reads the flag live rather than from a snapshot,
 * so withdrawal is immediate rather than "at the next publication".
 */
export async function setProgressConsent(consent: boolean): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ share_progress_consent: consent })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/portal/profile')
  revalidatePath('/success-stories')
  return { error: null }
}
