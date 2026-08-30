import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { COURSE_FIELDS, type Course } from '@/lib/catalog'
import { formatMoney } from '@/lib/class-types'
import { EmptyState, Panel, QuickActions, StatTile } from '@/components/app/Ui'
import TutorApprovals, { type PendingTutor } from './TutorApprovals'
import CourseModeration from './CourseModeration'

export const metadata = { title: 'Admin — StudEasy', robots: { index: false } }

export default async function AdminPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run the migrations in supabase/ to use this."
      />
    )
  }

  const supabase = await createClient()

  const [
    { count: accounts },
    { count: liveClasses },
    { data: tutors },
    { data: queued },
    { data: paidOrders },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('class_sessions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['published', 'in_progress']),
    supabase
      .from('profiles')
      .select('id, full_name, email, teaching_subjects, status, created_at')
      .eq('role', 'tutor')
      .order('created_at', { ascending: true }),
    supabase
      .from('courses')
      .select(COURSE_FIELDS)
      .eq('status', 'pending_review')
      .order('updated_at', { ascending: true }),
    supabase.from('orders').select('total_cents, currency').eq('status', 'paid'),
  ])

  const all = (tutors ?? []) as PendingTutor[]
  const orders = (paidOrders ?? []) as { total_cents: number; currency: string }[]
  const takings = orders.reduce((sum, o) => sum + o.total_cents, 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          What needs a decision?
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          Every figure below is counted from real records.
        </p>
      </header>

      <QuickActions
        actions={[
          { label: 'People & roles', href: '/portal/admin/people' },
          { label: 'Finance', href: '/portal/admin/finance' },
          { label: 'Help forum', href: '/forum' },
          { label: 'My profile', href: '/portal/profile' },
        ]}
      />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <StatTile label="Accounts" value={String(accounts ?? 0)} />
        </li>
        <li>
          <StatTile
            label="Tutors awaiting approval"
            value={String(all.filter((t) => t.status === 'pending').length)}
          />
        </li>
        <li>
          <StatTile label="Classes open" value={String(liveClasses ?? 0)} />
        </li>
        <li>
          <StatTile
            label="Taken so far"
            value={formatMoney(takings, orders[0]?.currency ?? 'NZD')}
          />
        </li>
      </ul>

      <Panel
        title="Tutor approvals"
        subtitle="Approving here unlocks that tutor's portal immediately."
      >
        <TutorApprovals
          pending={all.filter((t) => t.status === 'pending')}
          decided={all.filter((t) => t.status !== 'pending')}
        />
      </Panel>

      <Panel
        title="Course approvals"
        subtitle="Publishing puts a course on sale immediately."
      >
        <CourseModeration queue={(queued ?? []) as Course[]} />
      </Panel>
    </div>
  )
}
