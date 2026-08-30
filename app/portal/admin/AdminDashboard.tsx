'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { ADMIN } from '@/mock/admin'
import { adminBusinessSummary } from '@/mock/ai'
import AiPanel from '@/components/app/AiPanel'
import Figure from '@/components/app/Figure'
import {
  Panel,
  QuickActions,
  StatTile,
  StatusChip,
  type QuickAction,
} from '@/components/app/Ui'

export type AdminView = 'all' | 'analytics' | 'people' | 'finance'

/*
 * Only things that exist. "Add Student" and "Send Announcement" were here, and
 * there is no flow behind either — students register themselves, and there is
 * no announcement feature. Offering them was a promise the app could not keep.
 */
const ADMIN_ACTIONS: QuickAction[] = [
  { label: 'People & roles', href: '/portal/admin/people' },
  { label: 'Analytics', href: '/portal/admin/analytics' },
  { label: 'Finance', href: '/portal/admin/finance' },
  { label: 'Help forum', href: '/forum' },
]

const TITLES: Record<AdminView, string> = {
  all: 'How is the business doing, and what needs a decision?',
  analytics: 'Analytics',
  people: 'Students & tutors',
  finance: 'Finance & operations',
}

export default function AdminDashboard({ view = 'all' }: { view?: AdminView }) {
  const d = ADMIN
  const show = (section: AdminView) => view === 'all' || view === section

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {TITLES[view]}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          Founder view · all subjects, all tutors
        </p>
      </header>

      {view === 'all' && (
        <QuickActions actions={ADMIN_ACTIONS} />
      )}

      {/* 1 — Business Health Monitor */}
      {view === 'all' && (
      <Panel
        title="Business health monitor"
        subtitle="Flagged automatically, each with the number behind it."
      >
        <ul className="flex flex-col gap-3">
          {d.flags.map((f) => (
            <li key={f.id} className="rounded-xl border border-app-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    size={17}
                    aria-hidden
                    className={`mt-0.5 shrink-0 ${
                      f.severity.tone === 'bad' ? 'text-app-bad' : 'text-app-warn'
                    }`}
                  />
                  <div>
                    <p className="text-[0.95rem] font-medium">{f.title}</p>
                    <p className="mt-1 max-w-2xl text-[0.87rem] leading-relaxed font-light text-app-muted">
                      {f.detail}
                    </p>
                    <p className="mt-1.5 text-[0.83rem] font-medium">{f.metric}</p>
                  </div>
                </div>
                <StatusChip status={f.severity} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      )}

      {view === 'all' && (
        <AiPanel
          title="This week's read on the business"
          question="What actually needs my attention?"
          load={adminBusinessSummary}
        />
      )}

      {/* 2 — Business Overview */}
      {view === 'all' && (
      <div>
        <h2 className="mb-3 text-[1rem] font-semibold tracking-tight">Business overview</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {d.metrics.map((m) => (
            <li key={m.label}>
              <StatTile
                label={m.label}
                value={m.value}
                delta={m.delta}
                deltaTone={m.deltaTone}
              />
            </li>
          ))}
        </ul>
      </div>
      )}

      {/* 3 — Analytics */}
      {show('analytics') && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Revenue">
          <Figure chart={d.revenueTrend} kind="bar" />
        </Panel>
        <Panel title="Attendance">
          <Figure chart={d.attendanceTrend} unit="%" />
        </Panel>
        <Panel title="Retention" className="lg:col-span-2">
          <Figure chart={d.retentionTrend} kind="bar" unit="%" height={180} />
        </Panel>
      </div>
      )}

      {/*
        * 4 — Student & Tutor Management
        *
        * This was a table of five invented names captioned "Demo records", which
        * meant real signups appeared nowhere in the admin portal. The live list —
        * with join dates, last sign-in and role management — is its own page now.
        */}
      {show('people') && (
        <Panel
          title="Students & tutors"
          subtitle="Every real account, with when they joined and when they were last here."
        >
          <Link
            href="/portal/admin/people"
            className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
          >
            Open people &amp; roles
          </Link>
        </Panel>
      )}

      {/* 5 — Finance & Operations */}
      {show('finance') && (
      <Panel title="Finance & operations">
        <table className="hidden w-full text-left md:table">
          <caption className="sr-only">Payments, invoices, refunds and payroll</caption>
          <thead>
            <tr className="border-b border-app-border">
              {['Reference', 'Type', 'Party', 'Amount', 'Status', 'When'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="pb-3 text-[0.78rem] font-semibold tracking-wide text-app-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.finance.map((f) => (
              <tr key={f.id} className="border-b border-app-border last:border-0">
                <th scope="row" className="py-3.5 text-[0.88rem] font-medium">
                  {f.reference}
                </th>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{f.kind}</td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{f.party}</td>
                <td className="py-3.5 text-[0.88rem] font-medium">{f.amount}</td>
                <td className="py-3.5">
                  <StatusChip status={f.status} />
                </td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{f.at}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="flex flex-col gap-3 md:hidden">
          {d.finance.map((f) => (
            <li key={f.id} className="rounded-xl border border-app-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.92rem] font-medium">
                    {f.reference} · {f.amount}
                  </p>
                  <p className="mt-0.5 text-[0.83rem] font-light text-app-muted">
                    {f.kind} · {f.party} · {f.at}
                  </p>
                </div>
                <StatusChip status={f.status} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      )}
    </div>
  )
}
