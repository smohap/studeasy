'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { destinationFor, isSelectableRole, type SelectableRole } from '@/lib/roles'
import { SUBJECTS, YEAR_LEVELS } from '@/lib/curriculum'
import { isPlausibleBirthDate } from '@/lib/consent'
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
  /** `yyyy-mm-dd`. Students only — it is what the consent gate is decided on. */
  dateOfBirth?: string
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
    /*
     * Required, and checked here as well as in the browser. The database
     * treats a missing date of birth as under-age and gates the account, so
     * letting a blank through would not create a hole — it would create a
     * student who is stuck with no idea why. Better to refuse the form.
     */
    if (!details.dateOfBirth) return 'Enter your date of birth.'
    if (!isPlausibleBirthDate(details.dateOfBirth)) {
      return 'Check that date of birth — it does not look right.'
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
        // Picked up by studeasy_on_auth_user_dob, which sets the consent gate.
        date_of_birth: input.role === 'student' ? input.dateOfBirth : null,
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
      /*
       * A Google account arrives with no date of birth — there is no wizard
       * step 1 on that route — so this is where it is first set. The guard
       * trigger makes it write-once, so a second pass through this page
       * cannot revise it.
       */
      date_of_birth: details.role === 'student' ? details.dateOfBirth : null,
    })
    .eq('id', userId)

  if (error) return { error: error.message }

  if (details.role === 'parent' && details.studentCode) {
    const asked = await requestStudentLink(details.studentCode)
    if (asked.error) return asked
  }

  revalidatePath('/', 'layout')
  return { error: null }
}

/**
 * A parent or caregiver confirms a child under the age of consent.
 *
 * Every check that matters is in grant_parental_consent(): that the caller
 * holds the parent role, and that they are the student's LINKED parent, which
 * the student had to approve. Nothing here is trusted.
 */
export async function grantParentalConsent(studentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('grant_parental_consent', {
    student: studentId,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/parent')
  revalidatePath('/portal/student')
  return { error: null }
}

/** And takes it back. A consent that cannot be withdrawn is not a consent. */
export async function withdrawParentalConsent(studentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_parental_consent', {
    student: studentId,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/parent')
  revalidatePath('/portal/student')
  return { error: null }
}

/**
 * Asks a student to link. Quoting the code does not link anything — the
 * student has to approve it from their own portal first.
 */
export async function requestStudentLink(
  code: string,
): Promise<ActionResult & { state?: 'requested' | 'already_requested' | 'already_linked' }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('request_student_link', { code })
  if (error) return { error: error.message }

  revalidatePath('/portal/parent')
  return { error: null, state: data as 'requested' | 'already_requested' | 'already_linked' }
}

/** The student's answer. The database checks it really is them. */
export async function respondToLinkRequest(
  requestId: string,
  accept: boolean,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('respond_to_link_request', {
    request: requestId,
    accept,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/student')
  revalidatePath('/portal/parent')
  return { error: null }
}

/**
 * Sends the link request for a Student ID typed during email registration,
 * when no session existed to send it with. Runs once: the code is cleared from
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

  const { error } = await supabase.rpc('request_student_link', { code })
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
