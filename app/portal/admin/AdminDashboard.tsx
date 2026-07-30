'use client'

import { AlertTriangle } from 'lucide-react'
import { ADMIN } from '@/mock/admin'
import { adminBusinessSummary } from '@/mock/ai'
import AiPanel from '@/components/app/AiPanel'
import Figure from '@/components/app/Figure'
import { Panel, QuickActions, StatTile, StatusChip } from '@/components/app/Ui'

export type AdminView = 'all' | 'analytics' | 'people' | 'finance'

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
        <QuickActions
          actions={['Add Student', 'Add Tutor', 'Create Class', 'Send Announcement', 'View Reports']}
        />
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

      {/* 4 — Student & Tutor Management */}
      {show('people') && (
      <Panel title="Students & tutors" subtitle="Demo records — the live approval queue is below.">
        <table className="hidden w-full text-left md:table">
          <caption className="sr-only">People on the platform</caption>
          <thead>
            <tr className="border-b border-app-border">
              {['Name', 'Role', 'Detail', 'Status'].map((h) => (
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
            {d.users.map((u) => (
              <tr key={u.id} className="border-b border-app-border last:border-0">
                <th scope="row" className="py-3.5 text-[0.88rem] font-medium">
                  {u.name}
                </th>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{u.role}</td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{u.detail}</td>
                <td className="py-3.5">
                  <StatusChip status={u.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="flex flex-col gap-3 md:hidden">
          {d.users.map((u) => (
            <li key={u.id} className="rounded-xl border border-app-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.92rem] font-medium">{u.name}</p>
                  <p className="mt-0.5 text-[0.83rem] font-light text-app-muted">
                    {u.role} · {u.detail}
                  </p>
                </div>
                <StatusChip status={u.status} />
              </div>
            </li>
          ))}
        </ul>
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
