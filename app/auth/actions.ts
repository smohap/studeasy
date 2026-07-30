'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { destinationFor, isSelectableRole, type SelectableRole } from '@/lib/roles'
import { SUBJECTS, YEAR_LEVELS } from '@/lib/curriculum'
import { getSiteUrl } from '@/lib/site-url'

export type ActionResult = { error: string | null; message?: string }

/** Only values we offer are allowed through to the database. */
function cleanSubjects(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((s): s is string => typeof s === 'string' && SUBJECTS.includes(s))
}

export type RegistrationDetails = {
  role: SelectableRole
  yearLevel?: string
  subjects?: string[]
  teachingSubjects?: string[]
  studentCode?: string
}

function validate(details: RegistrationDetails): string | null {
  if (!isSelectableRole(details.role)) return 'Choose whether you are a student, parent or tutor.'

  if (details.role === 'student') {
    if (!details.yearLevel || !YEAR_LEVELS.includes(details.yearLevel)) {
      return 'Choose your year level.'
    }
    if (cleanSubjects(details.subjects).length === 0) {
      return 'Pick at least one subject you want help with.'
    }
  }

  if (details.role === 'tutor' && cleanSubjects(details.teachingSubjects).length === 0) {
    return 'Pick at least one subject you will teach.'
  }

  if (details.role === 'parent' && !details.studentCode?.trim()) {
    return "Enter your child's Student ID."
  }

  return null
}

/**
 * Email + password registration. Everything the wizard collected rides along
 * in user metadata; the signup trigger is what actually writes the profile,
 * so a tampered client cannot grant itself a role or skip tutor approval.
 */
export async function registerWithEmail(
  input: RegistrationDetails & { fullName: string; email: string; password: string },
): Promise<ActionResult> {
  const problem = validate(input)
  if (problem) return { error: problem }

  if (!input.fullName.trim()) return { error: 'Tell us your name.' }
  if (input.password.length < 8) return { error: 'Use at least 8 characters for your password.' }

  const supabase = await createClient()
  const siteUrl = await getSiteUrl()

  const { error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        full_name: input.fullName.trim(),
        role: input.role,
        year_level: input.role === 'student' ? input.yearLevel : null,
        subjects: input.role === 'student' ? cleanSubjects(input.subjects) : [],
        teaching_subjects:
          input.role === 'tutor' ? cleanSubjects(input.teachingSubjects) : [],
        // Redeeming a Student ID needs a session, which does not exist yet.
        // Parked here and cashed in on the parent's first portal visit.
        pending_student_code:
          input.role === 'parent' ? (input.studentCode?.trim().toUpperCase() ?? null) : null,
      },
    },
  })

  if (error) return { error: error.message }

  return {
    error: null,
    message:
      input.role === 'tutor'
        ? 'Account created. A site administrator needs to approve it before you can start teaching.'
        : 'Account created. Check your email if we asked you to confirm it.',
  }
}

/** Fills in role details for an account that registered through Google. */
export async function completeProfile(details: RegistrationDetails): Promise<ActionResult> {
  const problem = validate(details)
  if (problem) return { error: problem }

  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      role: details.role,
      year_level: details.role === 'student' ? details.yearLevel : null,
      subjects: details.role === 'student' ? cleanSubjects(details.subjects) : [],
      teaching_subjects:
        details.role === 'tutor' ? cleanSubjects(details.teachingSubjects) : [],
    })
    .eq('id', userId)

  if (error) return { error: error.message }

  if (details.role === 'parent' && details.studentCode) {
    const linked = await linkStudent(details.studentCode)
    if (linked.error) return linked
  }

  revalidatePath('/', 'layout')
  return { error: null }
}

/** Redeems a Student ID, via a SECURITY DEFINER function in the database. */
export async function linkStudent(code: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('link_parent_to_student', { code })
  if (error) return { error: error.message }
  revalidatePath('/portal/parent')
  return { error: null }
}

/**
 * Cashes in the Student ID a parent typed during email registration, when no
 * session existed to redeem it with. Runs once: the code is cleared from
 * metadata whether or not it worked, so a wrong ID does not retry forever —
 * the parent portal's own form is the way to correct it.
 */
export async function redeemPendingStudentCode(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const code = user?.user_metadata?.pending_student_code
  if (!user || typeof code !== 'string' || !code.trim()) return { error: null }

  const { error } = await supabase.rpc('link_parent_to_student', { code })
  await supabase.auth.updateUser({ data: { pending_student_code: null } })

  if (error) return { error: error.message }
  revalidatePath('/portal/parent')
  return { error: null }
}

export async function setTutorStatus(
  tutorId: string,
  next: 'active' | 'rejected',
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_tutor_status', { tutor: tutorId, next })
  if (error) return { error: error.message }
  revalidatePath('/portal/admin')
  return { error: null }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

/** Used after sign-in to land on the right portal. */
export async function destinationForCurrentUser(): Promise<string> {
  const { profile } = await getCurrentUser()
  return destinationFor(profile)
}

/**
 * Email + password sign-in, deliberately on the server.
 *
 * Doing this in the browser leaves the server blind to the new session until
 * the next full load: the redirect target then resolves against no user, and
 * the sign-in appears to hang until you refresh. Signing in here means
 * @supabase/ssr writes the session cookie as part of this response, so the
 * destination we hand back is already correct.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<ActionResult & { redirectTo?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) return { error: error.message }

  const { profile } = await getCurrentUser()
  revalidatePath('/', 'layout')
  return { error: null, redirectTo: destinationFor(profile) }
}
