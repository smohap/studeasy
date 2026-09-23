import type { ReactNode } from 'react'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { awaitingConsent } from '@/lib/roles'
import { currentParentEmail } from '@/lib/consent-invite'
import { maskEmail } from '@/lib/email-address'
import ConsentWaiting from './ConsentWaiting'

/**
 * Holds every student page behind the consent gate, not just the dashboard.
 *
 * Doing this per-page would be a list that has to stay complete, and the next
 * page somebody adds under /portal/student would be outside it without anyone
 * noticing. A layout is the only place the answer is "all of them".
 *
 * This is presentation. What actually stops a child's work being recorded is
 * in supabase/consent.sql and holds whether or not this component runs — a
 * student who types a URL directly, or posts to a server action, meets the
 * same refusal from Postgres.
 */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { profile } = await getCurrentUser()

  if (!awaitingConsent(profile)) return <>{children}</>

  // Their way out: a parent opening the emailed link. Masked here, server
  // side, so the raw address never reaches the client just to be shown back.
  let maskedEmail: string | null = null
  let hasInvitation = false
  if (isAuthConfigured) {
    const supabase = await createClient()
    const source = await currentParentEmail(supabase)
    if (source) {
      maskedEmail = maskEmail(source.email)
      hasInvitation = source.hasInvitation
    }
  }

  return (
    <ConsentWaiting
      name={profile?.full_name ?? null}
      maskedEmail={maskedEmail}
      hasInvitation={hasInvitation}
    />
  )
}
