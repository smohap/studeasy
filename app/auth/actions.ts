'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { destinationFor, isSelectableRole, type SelectableRole } from '@/lib/roles'
import { SUBJECTS, YEAR_LEVELS } from '@/lib/curriculum'
import { isPlausibleBirthDate, needsGuardianConsent } from '@/lib/consent'
import { getSiteUrl } from '@/lib/site-url'
import { isEmailish, maskEmail } from '@/lib/consent-token'
import { normaliseEmail } from '@/lib/email-address'
import { issueAndSendConsent, type ConsentInfo } from '@/lib/consent-invite'

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
  /** Students under the consent age only. Where the invitation goes. */
  parentEmail?: string
}

/**
 * `ownEmail`, when known, is the account's own address — used only for the
 * honest-guard below. Everything that actually decides whether the account
 * is gated happens later, in Postgres.
 */
function validate(details: RegistrationDetails, ownEmail?: string): string | null {
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
    /*
     * Re-derived from the date, never from whether the client happened to
     * send parentEmail — a tampered client that omits the field is still
     * under age and still needs to give one.
     */
    if (needsGuardianConsent(details.dateOfBirth)) {
      const parentEmail = details.parentEmail?.trim()
      if (!parentEmail || !isEmailish(parentEmail)) {
        return 'Enter a parent or caregiver email address.'
      }
      /*
       * Cheap and not a proof of anything — an emailed link only proves the
       * address exists, not who is on the other end of it. This just stops
       * the obviously-wrong case of a student giving their own address.
       */
      if (ownEmail && normaliseEmail(parentEmail) === normaliseEmail(ownEmail)) {
        return "That needs to be a parent or caregiver's address, not your own."
      }
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
): Promise<ActionResult & { consent?: ConsentInfo }> {
  const problem = validate(input, input.email)
  if (problem) return { error: problem }

  if (!input.fullName.trim()) return { error: 'Tell us your name.' }
  if (input.password.length < 8) return { error: 'Use at least 8 characters for your password.' }

  const supabase = await createClient()
  const siteUrl = await getSiteUrl()

  const underAge = input.role === 'student' && needsGuardianConsent(input.dateOfBirth)
  const parentEmail = underAge ? normaliseEmail(input.parentEmail ?? '') : null

  const { data, error } = await supabase.auth.signUp({
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
        // Held for the holding screen (Task 7) when signUp returns no
        // session below — there is nothing to issue the invitation with
        // yet, so that screen offers to send using this address once the
        // student has confirmed their own.
        parent_email: parentEmail,
      },
    },
  })

  if (error) return { error: error.message }

  let consent: ConsentInfo | undefined
  if (parentEmail && data.user) {
    if (data.session) {
      // Supabase project has email confirmation off: signUp returned a
      // session, so the student's own auth.uid() is available right now to
      // issue the invitation with. Once that is done there is no reason to
      // stay signed in — the account is held until a parent uses the link.
      consent = await issueAndSendConsent({
        supabase,
        studentId: data.user.id,
        // Raw: lib/email.ts reduces it to a safe first name.
        studentName: input.fullName,
        parentEmail,
        siteUrl,
      })
      await supabase.auth.signOut()
    } else {
      // Email confirmation is on: no session exists to issue with. The
      // student confirms their own address first, signs in, and the
      // holding screen sends this address from there.
      consent = { maskedEmail: maskEmail(parentEmail), state: 'pending-confirmation' }
    }
  }

  return {
    error: null,
    message:
      input.role === 'tutor'
        ? 'Account created. A site administrator needs to approve it before you can start teaching.'
        : 'Account created. Check your email if we asked you to confirm it.',
    consent,
  }
}

/** Fills in role details for an account that registered through Google. */
export async function completeProfile(
  details: RegistrationDetails,
): Promise<ActionResult & { consent?: ConsentInfo }> {
  const { userId, email: ownEmail, profile } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }

  const problem = validate(details, ownEmail ?? undefined)
  if (problem) return { error: problem }

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

  let consent: ConsentInfo | undefined
  const underAge = details.role === 'student' && needsGuardianConsent(details.dateOfBirth)
  if (underAge && details.parentEmail) {
    // A Google sign-in always has a session — issue and send now, then sign
    // out. The wizard must not land this student in the portal afterwards;
    // it is held until a parent uses the link.
    const siteUrl = await getSiteUrl()
    consent = await issueAndSendConsent({
      supabase,
      studentId: userId,
      // Raw: lib/email.ts reduces it to a safe first name (or "your child").
      studentName: profile?.full_name ?? '',
      parentEmail: normaliseEmail(details.parentEmail),
      siteUrl,
    })
    await supabase.auth.signOut()
  }

  revalidatePath('/', 'layout')
  return { error: null, consent }
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
