'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { isEmailish, normaliseEmail } from '@/lib/email-address'
import {
  currentParentEmail,
  issueConsentInvitation,
  type IssueResult,
} from '@/lib/consent-invite'

/**
 * What the holding screen's two actions hand back. Never "something went
 * wrong" for a rate limit or a linked parent — those are legitimate outcomes
 * the screen has to be honest about, not failures.
 *
 * `retryAfter`, when present, is when the 5-minute-per-send cooldown lifts —
 * an ISO string the client formats in the viewer's own locale. Its absence
 * on a 'rate_limited' result means the five-a-day cap was hit instead, which
 * has no single moment to name.
 */
export type ConsentEmailResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: 'rate_limited'; retryAfter?: string }
  | { ok: false; reason: 'parent_linked' }
  | { ok: false; reason: 'error'; message: string }

type Supabase = Awaited<ReturnType<typeof createClient>>

async function rateLimitResult(supabase: Supabase, studentId: string): Promise<ConsentEmailResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('consent_email_last_at')
    .eq('id', studentId)
    .maybeSingle()

  const lastAt =
    profile?.consent_email_last_at ? new Date(profile.consent_email_last_at as string) : null
  const cooldownEnds = lastAt ? lastAt.getTime() + 5 * 60 * 1000 : null

  if (cooldownEnds && cooldownEnds > Date.now()) {
    return { ok: false, reason: 'rate_limited', retryAfter: new Date(cooldownEnds).toISOString() }
  }
  // Not the 5-minute cooldown, so it is the five-a-day cap — no single
  // moment to give back for that one.
  return { ok: false, reason: 'rate_limited' }
}

async function toResult(
  supabase: Supabase,
  studentId: string,
  issued: IssueResult,
): Promise<ConsentEmailResult> {
  if (issued.outcome === 'sent') return { ok: true, maskedEmail: issued.maskedEmail }
  if (issued.outcome === 'rate_limited') return rateLimitResult(supabase, studentId)
  // Not an error and not retryable: the linked parent confirms from their
  // own account, so the screen says that instead of "try again".
  if (issued.outcome === 'parent_linked') return { ok: false, reason: 'parent_linked' }
  if (issued.outcome === 'not_required') {
    return {
      ok: false,
      reason: 'error',
      message: 'This looks already sorted — try reloading the page.',
    }
  }
  return {
    ok: false,
    reason: 'error',
    message: 'That could not be sent just now. Try again in a moment.',
  }
}

async function sendTo(
  supabase: Supabase,
  studentId: string,
  parentEmail: string,
): Promise<ConsentEmailResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', studentId)
    .maybeSingle()
  const siteUrl = await getSiteUrl()

  const issued = await issueConsentInvitation({
    supabase,
    studentId,
    // Raw: lib/email.ts reduces it to a safe first name (or "your child").
    studentName: profile?.full_name ?? '',
    parentEmail,
    siteUrl,
  })
  return toResult(supabase, studentId, issued)
}

/**
 * Resends to whichever address is already on file. No arguments: the
 * student id comes from the session, never from the client, and so does the
 * address itself — re-read here via currentParentEmail rather than trusted
 * from whatever the button happened to be showing.
 */
export async function resendConsentEmail(): Promise<ConsentEmailResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'error', message: 'You are not signed in.' }

  const source = await currentParentEmail(supabase)
  if (!source) {
    return {
      ok: false,
      reason: 'error',
      message: 'There is no address on file yet — add one below.',
    }
  }

  const result = await sendTo(supabase, user.id, source.email)
  if (result.ok) revalidatePath('/portal/student')
  return result
}

/**
 * Points the invitation at a different address. issue_consent_invitation()
 * invalidates whichever link was outstanding, so this both corrects a typo
 * and cuts off the old address in one step.
 *
 * A student doing this can point it anywhere, including an address that
 * isn't really a parent's — but that adds no weakness the first address did
 * not already have: they chose that one too, and an emailed link only ever
 * proves the address exists, never who is on the other end of it.
 */
export async function changeParentEmail(email: string): Promise<ConsentEmailResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'error', message: 'You are not signed in.' }

  const trimmed = email.trim()
  if (!isEmailish(trimmed)) {
    return { ok: false, reason: 'error', message: 'That does not look like an email address.' }
  }

  const normalised = normaliseEmail(trimmed)
  if (user.email && normalised === normaliseEmail(user.email)) {
    return {
      ok: false,
      reason: 'error',
      message: "That needs to be a parent or caregiver's address, not your own.",
    }
  }

  const result = await sendTo(supabase, user.id, normalised)
  if (result.ok) revalidatePath('/portal/student')
  return result
}
