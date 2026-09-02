import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getTutorAnalytics } from '@/lib/analytics-data'
import { formatPrice } from '@/lib/catalog'
import { EmptyState, Panel } from '@/components/app/Ui'
import MonthlyBars from '@/components/app/MonthlyBars'

export const metadata = { title: 'Performance — StudEasy', robots: { index: false } }

/*
 * Counts of this teacher's own records. The charts that used to be here were
 * invented figures about a teacher's effectiveness, which is a bad thing to be
 * wrong about in either direction.
 *
 * Nothing here is broken down per student. Measuring a teacher against named
 * children is a claim that needs far more care than an aggregate query.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  const data = await getTutorAnalytics()

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <Header />
        <EmptyState
          title="Could not load your figures"
          body="The query failed. Nothing is shown rather than a partial total — a number quietly missing rows is worse than no number."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Header />

      <Panel title="Your teaching">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Students" value={String(data.students)} />
          <Stat label="Published courses" value={String(data.courses.published)} />
          <Stat label="Upcoming classes" value={String(data.classes.upcoming)} />
          <Stat label="Classes held" value={String(data.classes.held)} />
        </dl>
      </Panel>

      <Panel
        title="Assessments"
        subtitle="Pass rate counts only attempts you have released."
      >
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Handed in" value={String(data.assessments.submitted)} />
          <Stat label="Passed" value={String(data.assessments.passed)} />
          {/*
            * An em dash, never 0. "Nothing marked yet" and "everybody failed"
            * must not read as the same number on this page of all pages.
            */}
          <Stat
            label="Pass rate"
            value={
              data.assessments.pass_rate_pct == null
                ? '—'
                : `${data.assessments.pass_rate_pct}%`
            }
          />
          <Stat
            label="Waiting on you"
            value={String(data.marking.waiting)}
            emphasis={data.marking.waiting > 0}
          />
        </dl>
      </Panel>

      <Panel title="Reviews" subtitle="Averaged across your courses, weighted by count.">
        <dl className="grid grid-cols-2 gap-4">
          <Stat
            label="Average rating"
            value={data.rating.average == null ? '—' : `${data.rating.average} / 5`}
          />
          <Stat label="Reviews" value={String(data.rating.reviews)} />
        </dl>
      </Panel>

      <Panel title="Earnings" subtitle="Your share after the platform fee. NZD.">
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Paid out" value={formatPrice(data.earnings.paid_cents, 'NZD')} />
          <Stat label="Owed" value={formatPrice(data.earnings.owed_cents, 'NZD')} />
        </dl>

        <div className="mt-6">
          <MonthlyBars points={data.earnings.monthly} label="Earned by month" />
        </div>
      </Panel>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
        Performance
      </h1>
      <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
        Counts of your own records. No projections, and nothing broken down by
        individual student.
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
