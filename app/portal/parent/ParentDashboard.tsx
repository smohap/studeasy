'use client'

import { useState } from 'react'
import { Download, Mail } from 'lucide-react'
import { PARENT } from '@/mock/parent'
import { parentInsight } from '@/mock/ai'
import AiPanel from '@/components/app/AiPanel'
import Figure from '@/components/app/Figure'
import { EmptyState, Panel, QuickActions, StatusChip } from '@/components/app/Ui'

export type ParentView = 'all' | 'reports' | 'messages' | 'billing'

const TITLES: Record<ParentView, string> = {
  all: 'Is this working, and do I need to do anything?',
  reports: 'Progress reports',
  messages: 'Messages & announcements',
  billing: 'Bookings & payments',
}

export default function ParentDashboard({
  view = 'all',
  name,
}: {
  view?: ParentView
  name?: string | null
}) {
  const d = PARENT
  const [selected, setSelected] = useState(d.children[0]?.child.id ?? '')
  const active = d.children.find((c) => c.child.id === selected) ?? d.children[0]
  const show = (section: ParentView) => view === 'all' || view === section

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {TITLES[view]}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          {name ?? d.parent.name} · {d.children.length} children enrolled
        </p>
      </header>

      {view === 'all' && (
        <QuickActions
          actions={['Book Lesson', 'Pay Fees', 'Message Tutor', 'View Reports', 'Download Invoice']}
        />
      )}

      {/* 1 — Child Overview */}
      {view === 'all' && (
      <Panel title="Child overview" subtitle="Switch between children to see each one's detail.">
        {d.children.length === 0 ? (
          <EmptyState
            title="No children linked yet"
            body="Add your child's Student ID and their attendance, homework and next class appear here."
          />
        ) : (
          <>
            <div role="tablist" aria-label="Choose a child" className="mb-5 flex flex-wrap gap-2">
              {d.children.map((c) => (
                <button
                  key={c.child.id}
                  type="button"
                  role="tab"
                  aria-selected={c.child.id === selected}
                  onClick={() => setSelected(c.child.id)}
                  className={`rounded-full border px-4 py-2 text-[0.86rem] transition-colors ${
                    c.child.id === selected
                      ? 'border-app-ink bg-app-ink font-medium text-white'
                      : 'border-app-border font-light text-app-ink hover:bg-app-subtle'
                  }`}
                >
                  {c.child.name}
                </button>
              ))}
            </div>

            {active && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[1.05rem] font-semibold">{active.child.name}</p>
                    <p className="mt-0.5 text-[0.86rem] font-light text-app-muted">
                      {active.child.yearLevel} · {active.tutor}
                    </p>
                  </div>
                  <StatusChip status={active.status} />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Fact label="Attendance" value={`${active.attendancePct}%`} />
                  <Fact
                    label="Lessons completed"
                    value={`${active.lessonsCompleted} of ${active.lessonsBooked}`}
                  />
                  <Fact label="Homework done" value={`${active.homeworkCompletionPct}%`} />
                  <Fact label="Next class" value={active.nextClass} />
                </dl>
              </div>
            )}
          </>
        )}
      </Panel>
      )}

      {/* 2 — AI Parent Insights */}
      {view === 'all' && active && (
        <AiPanel
          title="This week, in plain English"
          question="How is my child really doing?"
          load={() => parentInsight(active.child.name)}
        />
      )}

      {/* 3 — Progress Report */}
      {show('reports') && (
      <Panel title="Progress report">
        <Figure chart={d.progressBySubject} unit="%" />

        <div className="mt-7 border-t border-app-border pt-6">
          <h3 className="text-[0.92rem] font-semibold">Tutor comments</h3>
          <ul className="mt-4 flex flex-col gap-4">
            {d.tutorComments.map((c) => (
              <li key={c.id} className="rounded-xl border border-app-border p-4">
                <p className="text-[0.84rem] font-medium text-app-muted">
                  {c.tutor} on {c.child} · {c.at}
                </p>
                <p className="mt-2 text-[0.9rem] leading-relaxed font-light text-app-ink">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
      )}

      {/* 4 — Communication Centre */}
      {show('messages') && (
      <Panel title="Communication centre">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-[0.92rem] font-semibold">Messages</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {d.messages.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl border border-app-border p-3.5"
                >
                  <Mail size={16} aria-hidden className="mt-0.5 shrink-0 text-app-muted" />
                  <div className="min-w-0">
                    <p className="text-[0.88rem] font-medium">
                      {m.from}
                      {m.unread && (
                        <span className="ml-2 rounded-full bg-app-warn-bg px-2 py-0.5 text-[0.7rem] font-semibold text-app-warn">
                          Unread
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[0.85rem] leading-relaxed font-light text-app-muted">
                      {m.preview}
                    </p>
                    <p className="mt-1 text-[0.78rem] font-light text-app-muted">{m.at}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[0.92rem] font-semibold">Announcements</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {d.announcements.map((n) => (
                <li key={n.id} className="rounded-xl border border-app-border p-3.5">
                  <p className="text-[0.88rem] font-medium">{n.title}</p>
                  <p className="mt-1 text-[0.85rem] leading-relaxed font-light text-app-muted">
                    {n.body}
                  </p>
                  <p className="mt-1 text-[0.78rem] font-light text-app-muted">{n.at}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
      )}

      {/* 5 — Bookings & Payments */}
      {show('billing') && (
      <Panel
        title="Bookings & payments"
        subtitle={`${d.subscription.plan} · ${d.subscription.amount} · renews ${d.subscription.renews}`}
      >
        {/* Table above md, cards below — never a horizontal scroll. */}
        <table className="hidden w-full text-left md:table">
          <caption className="sr-only">Invoice history</caption>
          <thead>
            <tr className="border-b border-app-border">
              {['Reference', 'Period', 'Issued', 'Amount', 'Status', ''].map((h) => (
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
            {d.invoices.map((i) => (
              <tr key={i.id} className="border-b border-app-border last:border-0">
                <td className="py-3.5 text-[0.88rem] font-medium">{i.reference}</td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{i.period}</td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{i.issued}</td>
                <td className="py-3.5 text-[0.88rem] font-medium">{i.amount}</td>
                <td className="py-3.5">
                  <StatusChip status={i.status} />
                </td>
                <td className="py-3.5 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-app-border px-3 py-1.5 text-[0.8rem] font-medium hover:bg-app-subtle"
                  >
                    <Download size={13} aria-hidden />
                    <span className="sr-only">Download </span>PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="flex flex-col gap-3 md:hidden">
          {d.invoices.map((i) => (
            <li key={i.id} className="rounded-xl border border-app-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.9rem] font-medium">{i.reference}</p>
                  <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                    {i.period} · {i.amount}
                  </p>
                </div>
                <StatusChip status={i.status} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-app-border p-4">
      <dt className="text-[0.78rem] font-medium text-app-muted">{label}</dt>
      <dd className="mt-1.5 text-[0.98rem] leading-snug font-semibold">{value}</dd>
    </div>
  )
}
