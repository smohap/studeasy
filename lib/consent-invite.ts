import type { createClient } from '@/lib/supabase/server'
import { mintToken, maskEmail } from '@/lib/consent-token'
import { sendConsentEmail } from '@/lib/email'

/**
 * Server-only, but deliberately not a 'use server' file: those may only
 * export async functions, and every export becomes a callable endpoint. This
 * is shared plumbing for two different 'use server' files — app/auth/actions.ts
 * (registration) and app/portal/student/consent-actions.ts (the holding
 * screen's resend/change) — and neither of those is the right place for the
 * other to import from.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * What the wizard's done screen (and the Google-route completion screen)
 * needs to tell the student what happened to the parental-consent email.
 * `maskedEmail` is computed here, server-side, so the raw address never
 * round-trips through the client just to be displayed back at it.
 */
export type ConsentInfo = {
  maskedEmail: string
  /**
   * 'parent-linked': the student already has a linked parent account, so no
   * email goes out — that parent confirms from their own portal. Not
   * reachable from a brand-new registration today (nobody can be linked to
   * an account that did not exist a moment ago), but the database can say
   * it, so the screen must be able to as well.
   */
  state: 'sent' | 'pending-confirmation' | 'not-sent' | 'parent-linked'
}

/**
 * The four words issue_consent_invitation() actually returns, plus 'error'
 * for everything that stops it being called at all (network, RLS, a raised
 * exception). Richer than ConsentInfo's collapsed `state` — the holding
 * screen needs to tell 'rate_limited' apart from a plain failure so it can
 * say when to try again instead of "something went wrong".
 *
 * 'parent_linked' is the database refusing the email route because the
 * student has a linked parent account: that parent consents (or has
 * withdrawn consent) from their own portal, and a link the child emails to
 * any address must not override them.
 */
export type IssueOutcome = 'sent' | 'not_required' | 'parent_linked' | 'rate_limited' | 'error'

export type IssueResult = { outcome: IssueOutcome; maskedEmail: string }

/**
 * Mints a token, asks Postgres to record it, and — only on 'sent' — emails
 * it. The raw token lives only in the URL handed to sendConsentEmail: it is
 * never logged and never returned to the caller. Only its hash reaches
 * Postgres, via issue_consent_invitation.
 */
export async function issueConsentInvitation({
  supabase,
  studentId,
  studentName,
  parentEmail,
  siteUrl,
}: {
  supabase: Supabase
  studentId: string
  studentName: string
  parentEmail: string
  siteUrl: string
}): Promise<IssueResult> {
  const maskedEmail = maskEmail(parentEmail)

  try {
    const raw = mintToken()
    const { data: outcome, error } = await supabase.rpc('issue_consent_invitation', {
      student: studentId,
      email: parentEmail,
      raw_token: raw,
    })

    if (error) return { outcome: 'error', maskedEmail }
    if (outcome === 'not_required') return { outcome: 'not_required', maskedEmail }
    if (outcome === 'rate_limited') return { outcome: 'rate_limited', maskedEmail }
    if (outcome === 'parent_linked') return { outcome: 'parent_linked', maskedEmail }

    const sent = await sendConsentEmail({
      to: parentEmail,
      studentName,
      url: `${siteUrl}/consent/${raw}`,
    })
    return { outcome: sent.sent ? 'sent' : 'error', maskedEmail }
  } catch {
    return { outcome: 'error', maskedEmail }
  }
}

/**
 * Mints and issues a parental-consent invitation, then emails it. Shared by
 * `registerWithEmail` (when signUp returns a session) and `completeProfile`
 * (the Google route, which always has one) — both need the same three steps
 * in the same order, and both must never let a failure here fail the caller.
 *
 * A thin wrapper over issueConsentInvitation: registration shows "sent",
 * "not sent" or "a linked parent confirms instead", so 'not_required' and
 * 'rate_limited' collapse into the same 'not-sent' the wizard already
 * handles — the holding screen's resend is the way to try again — while
 * 'parent_linked' keeps its own state, because "try again" would be wrong
 * advice for it.
 */
export async function issueAndSendConsent(args: {
  supabase: Supabase
  studentId: string
  studentName: string
  parentEmail: string
  siteUrl: string
}): Promise<ConsentInfo> {
  const result = await issueConsentInvitation(args)
  return {
    maskedEmail: result.maskedEmail,
    state:
      result.outcome === 'sent'
        ? 'sent'
        : result.outcome === 'parent_linked'
          ? 'parent-linked'
          : 'not-sent',
  }
}

/**
 * The address a consent email would go to right now, and whether one has
 * already been sent there.
 *
 * `my_consent_email()` is the newest invitation's address — if one exists,
 * the button on the holding screen is a resend. If none does, this falls
 * back to the parent address given at registration (held in the student's
 * own user metadata, per registerWithEmail): the screen still has an address
 * to show, but the button reads "Send" rather than "Resend" — nothing has
 * gone out yet, and no invitation is issued just by rendering this screen.
 */
export async function currentParentEmail(
  supabase: Supabase,
): Promise<{ email: string; hasInvitation: boolean } | null> {
  const { data: fromInvite } = await supabase.rpc('my_consent_email')
  if (typeof fromInvite === 'string' && fromInvite.trim()) {
    return { email: fromInvite, hasInvitation: true }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const meta = user?.user_metadata?.parent_email
  if (typeof meta === 'string' && meta.trim()) {
    return { email: meta, hasInvitation: false }
  }

  return null
}
