import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getAdminAnalytics } from '@/lib/analytics-data'
import { formatPrice } from '@/lib/catalog'
import { EmptyState, Panel } from '@/components/app/Ui'
import MonthlyBars from '@/components/app/MonthlyBars'

export const metadata = { title: 'Analytics — StudEasy', robots: { index: false } }

/*
 * Every figure here is a count or a sum of rows that exist. The charts that
 * used to be on this page came from a fixtures file — invented revenue and
 * retention rendered as a business dashboard, which is the most dangerous kind
 * of dummy data because it looks like a basis for a decision.
 *
 * There are deliberately no projections and no percentage trends. A trend
 * needs a baseline this platform has not run long enough to have.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  const data = await getAdminAnalytics()

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <Header />
        <EmptyState
          title="Could not load the figures"
          body="The analytics query was refused or failed. Nothing is shown rather than a partial total, because a number quietly missing rows is worse than no number."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Header />

      <Panel title="Money" subtitle="Settled through Stripe. Amounts in NZD.">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Paid" value={formatPrice(data.revenue.paid_cents, 'NZD')} />
          <Stat label="Paid orders" value={String(data.revenue.paid_orders)} />
          <Stat
            label="Refunded"
            value={formatPrice(data.revenue.refunded_cents, 'NZD')}
          />
          <Stat
            label="Owed to teachers"
            value={formatPrice(data.revenue.payouts_owed_cents, 'NZD')}
          />
        </dl>

        <div className="mt-6">
          <MonthlyBars points={data.revenue.monthly} label="Paid by month" />
        </div>
      </Panel>

      <Panel title="People">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Students" value={String(data.people.students)} />
          <Stat label="Parents" value={String(data.people.parents)} />
          <Stat label="Teachers" value={String(data.people.tutors)} />
          {/* The one number here that is a to-do list rather than a metric. */}
          <Stat
            label="Teachers awaiting approval"
            value={String(data.people.tutors_pending)}
            emphasis={data.people.tutors_pending > 0}
          />
        </dl>
      </Panel>

      <Panel title="Catalogue">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Published courses"
            value={String(data.catalog.courses_published)}
          />
          <Stat label="Drafts" value={String(data.catalog.courses_draft)} />
          <Stat
            label="Awaiting review"
            value={String(data.catalog.courses_in_review)}
            emphasis={data.catalog.courses_in_review > 0}
          />
          <Stat label="Upcoming classes" value={String(data.catalog.classes_upcoming)} />
        </dl>
      </Panel>

      <Panel title="Activity">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Enrolments" value={String(data.activity.enrolments)} />
          <Stat
            label="Class registrations"
            value={String(data.activity.class_registrations)}
          />
          <Stat
            label="Attempts, last 30 days"
            value={String(data.activity.attempts_30d)}
          />
          <Stat
            label="Open help requests"
            value={String(data.activity.help_open)}
            emphasis={data.activity.help_open > 0}
          />
          <Stat
            label="Waiting to be marked"
            value={String(data.activity.marking_waiting)}
            emphasis={data.activity.marking_waiting > 0}
          />
          <Stat label="Unpaid orders" value={String(data.revenue.pending_orders)} />
        </dl>
      </Panel>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
        Analytics
      </h1>
      <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
        Counts of real records. No projections — every number here is something that
        happened.
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasis ? 'border-accent-deep/40 bg-accent-deep/5' : 'border-app-border'
      }`}
    >
      <dt className="text-[0.74rem] font-medium tracking-[0.12em] text-app-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-[1.35rem] leading-none font-semibold">{value}</dd>
    </div>
  )
}
