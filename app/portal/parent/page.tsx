import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { redeemPendingStudentCode } from '@/app/auth/actions'
import { getMyChildren } from '@/lib/family-data'
import { EmptyState, QuickActions } from '@/components/app/Ui'
import ChildrenPanel, { type PendingLink } from './ChildrenPanel'

export const metadata = { title: 'Parent — StudEasy', robots: { index: false } }

export default async function ParentPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'parent')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/family.sql to use this."
      />
    )
  }

  // A Student ID typed during email registration could not be redeemed then —
  // there was no session. Cash it in now, once.
  const pending = await redeemPendingStudentCode()

  const supabase = await createClient()
  const [children, { data: waiting }] = await Promise.all([
    getMyChildren(),
    supabase.rpc('my_pending_links'),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {children.length === 0
            ? 'Add your child to get started'
            : 'How are they getting on?'}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          {profile?.full_name ?? 'Your account'}
          {children.length > 0 &&
            ` · ${children.length} ${children.length === 1 ? 'child' : 'children'}`}
        </p>
      </header>

      <QuickActions
        actions={[
          { label: 'Progress reports', href: '/portal/parent/reports' },
          { label: 'Bookings & payments', href: '/portal/parent/billing' },
          { label: 'Find a class', href: '/classes' },
          { label: 'My profile', href: '/portal/profile' },
        ]}
      />

      {pending.error && (
        <p
          role="alert"
          className="rounded-xl border border-app-bad/30 bg-app-bad-bg p-4 text-[0.88rem] leading-relaxed font-light text-app-ink"
        >
          We could not use the Student ID you gave when registering: {pending.error} Try
          again below.
        </p>
      )}

      <ChildrenPanel children={children} pendingLinks={(waiting ?? []) as PendingLink[]} />
    </div>
  )
}
