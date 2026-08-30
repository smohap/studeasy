'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarDays, UserMinus } from 'lucide-react'
import { EmptyState, Panel } from '@/components/app/Ui'
import type { ChildSummary } from '@/lib/family-data'
import { removeChild } from './family-actions'
import LinkStudentForm from './LinkStudentForm'

export type PendingLink = { id: string; student_code: string; asked_at: string }

function whenClass(startsAt: string, endsAt: string) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const day = new Intl.DateTimeFormat('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(start)
  const time = new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time.format(start)}–${time.format(end)}`
}

export default function ChildrenPanel({
  children,
  pendingLinks,
}: {
  children: ChildSummary[]
  pendingLinks: PendingLink[]
}) {
  return (
    <Panel
      title="Your children"
      subtitle="Their real activity. Nothing appears until they approve the link."
    >
      {children.length === 0 ? (
        <EmptyState
          title="No children linked yet"
          body="Ask your child for the Student ID on their portal, then add it below. They have to approve the request before you see anything."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {children.map((c) => (
            <ChildCard key={c.id} child={c} />
          ))}
        </ul>
      )}

      {pendingLinks.length > 0 && (
        <div className="mt-6 rounded-xl border border-app-warn/30 bg-app-warn-bg p-4">
          <p className="text-[0.9rem] font-medium text-app-ink">
            Waiting on your {pendingLinks.length === 1 ? 'child' : 'children'}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {pendingLinks.map((r) => (
              <li key={r.id} className="text-[0.87rem] font-light text-app-muted">
                <span className="font-mono text-app-ink">{r.student_code}</span> — not
                approved yet. They will see the request when they next sign in.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 border-t border-app-border pt-6">
        <LinkStudentForm />
      </div>
    </Panel>
  )
}

function ChildCard({ child: c }: { child: ChildSummary }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <li className="rounded-xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.98rem] font-medium text-app-ink">
            {c.fullName ?? 'Student'}
            {c.studentCode && (
              <span className="ml-2 font-mono text-[0.82rem] text-accent-deep">
                {c.studentCode}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
            {c.yearLevel ?? 'Year level not set'}
            {c.subjects.length > 0 && ` · ${c.subjects.join(', ')}`}
          </p>
        </div>

        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[0.82rem] font-light text-app-muted">
              Remove {c.fullName ?? 'this student'} from your account?
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setError((await removeChild(c.id)).error))}
              className="rounded-full bg-app-bad-bg px-4 py-2 text-[0.82rem] font-medium text-app-bad disabled:opacity-60"
            >
              {pending ? 'Removing…' : 'Remove'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[0.82rem] font-light text-app-muted"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle"
          >
            <UserMinus size={14} aria-hidden />
            Remove
          </button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label="Work handed in" value={String(c.handedIn)} />
        <Fact label="Marked" value={String(c.marked)} />
        <Fact
          label="Average"
          value={c.averagePct == null ? 'Nothing marked yet' : `${c.averagePct}%`}
        />
      </dl>

      {c.upcoming.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[0.82rem] font-medium text-app-muted">Coming up</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {c.upcoming.slice(0, 3).map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-2 text-[0.85rem] font-light text-app-muted"
              >
                <CalendarDays size={13} aria-hidden className="shrink-0 text-accent" />
                <Link href={`/classes/${k.id}`} className="hover:underline">
                  {k.title}
                </Link>
                <span>· {whenClass(k.startsAt, k.endsAt)}</span>
                {k.registrationStatus === 'offered' && (
                  <span className="text-app-warn">· payment due</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-app-subtle p-3">
      <dt className="text-[0.75rem] font-medium text-app-muted">{label}</dt>
      <dd className="mt-1 text-[0.95rem] leading-snug font-semibold text-app-ink">
        {value}
      </dd>
    </div>
  )
}
