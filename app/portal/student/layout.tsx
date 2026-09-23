import type { ReactNode } from 'react'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { awaitingConsent } from '@/lib/roles'
import ConsentWaiting from './ConsentWaiting'
import type { LinkRequest } from './LinkRequests'

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

  // Their only way out: a parent to approve, who can then confirm them.
  let requests: LinkRequest[] = []
  if (isAuthConfigured) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('my_link_requests')
    requests = (data as LinkRequest[]) ?? []
  }

  return (
    <ConsentWaiting
      name={profile?.full_name ?? null}
      studentCode={profile?.student_code ?? null}
      requests={requests}
    />
  )
}
