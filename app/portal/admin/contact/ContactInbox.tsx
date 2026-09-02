'use client'

import { useState, useTransition } from 'react'
import { StatusChip } from '@/components/app/Ui'
import type { ContactMessage } from '@/lib/admin-data'
import type { Status } from '@/types/dashboard'
import { setContactStatus } from './actions'

const TOPIC_LABEL: Record<string, string> = {
  tutoring: 'Tutoring',
  billing: 'Billing',
  technical: 'Technical',
  partnership: 'Partnership',
  other: 'Other',
}

const STATUS: Record<ContactMessage['status'], Status> = {
  new: { label: 'Needs a reply', tone: 'warn' },
  read: { label: 'Read', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'good' },
}

export default function ContactInbox({ messages }: { messages: ContactMessage[] }) {
  const [rows, setRows] = useState(messages)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function move(id: string, status: ContactMessage['status']) {
    setError(null)
    const before = rows
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
    start(async () => {
      const res = await setContactStatus(id, status)
      // Put the row back rather than leaving the screen claiming a state the
      // database refused.
      if (res.error) {
        setRows(before)
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-[0.85rem] font-light text-app-bad">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((m) => (
          <li
            key={m.id}
            className="rounded-xl border border-app-border bg-app p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.95rem] font-medium text-app-ink">
                  {m.name}{' '}
                  <a
                    href={`mailto:${m.email}?subject=Re%3A%20your%20StudEasy%20enquiry`}
                    className="font-light text-app-muted underline"
                  >
                    {m.email}
                  </a>
                </p>
                <p className="mt-1 text-[0.8rem] font-light text-app-muted">
                  {TOPIC_LABEL[m.topic] ?? m.topic} ·{' '}
                  {new Date(m.at).toLocaleString('en-NZ', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <StatusChip status={STATUS[m.status]} />
            </div>

            <p className="mt-3 text-[0.9rem] leading-relaxed font-light whitespace-pre-wrap text-app-ink">
              {m.message}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['new', 'read', 'closed'] as const)
                .filter((s) => s !== m.status)
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pending}
                    onClick={() => move(m.id, s)}
                    className="rounded-lg border border-app-border px-3 py-1.5 text-[0.82rem] font-light text-app-ink disabled:opacity-60"
                  >
                    {s === 'new'
                      ? 'Reopen'
                      : s === 'read'
                        ? 'Mark read'
                        : 'Close'}
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
