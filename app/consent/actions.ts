'use server'

import { createClient, isAuthConfigured } from '@/lib/supabase/server'

export type RedeemConsentResult =
  | { ok: true; studentName: string }
  | { ok: false }

/**
 * Redeems a parental-consent token. `rawToken` arrives from the page's own
 * URL path, passed through as a hidden form field — never re-derived from
 * headers, and never logged here on any path.
 *
 * One failure shape covers a bad, expired or already-spent token, an RPC
 * error, and a token for a student who no longer needs consent: the form
 * shows the same "no longer valid" wording the page itself uses for those
 * cases, so a redeem attempt can't tell an attacker anything a describe
 * call didn't already.
 */
export async function redeemConsent(rawToken: string): Promise<RedeemConsentResult> {
  if (!isAuthConfigured) return { ok: false }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('redeem_consent_invitation', {
    raw_token: rawToken,
  })

  if (error) {
    console.error('redeem_consent_invitation failed:', error.message)
    return { ok: false }
  }

  const row = (data as { student_name: string }[] | null)?.[0]
  if (!row) return { ok: false }

  return { ok: true, studentName: row.student_name }
}
