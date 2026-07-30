'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCourseStatus } from '@/app/shop/actions'
import { formatPrice, type Course } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'

/** Section 7: no teacher publishes paid content without a decision here. */
export default function CourseModeration({ queue }: { queue: Course[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function decide(id: string, next: 'published' | 'draft') {
    setBusyId(id)
    setError(null)
    start(async () => {
      const result = await setCourseStatus(id, next)
      if (result.error) setError(result.error)
      setBusyId(null)
      router.refresh()
    })
  }

  if (queue.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting"
        body="Courses submitted for approval appear here. Until you publish one, students cannot see or buy it."
      />
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {queue.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-4 rounded-xl border border-app-warn/30 bg-app-warn-bg p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-[0.95rem] font-medium text-app-ink">{c.title}</p>
              <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                {c.teacher_name} · {c.subject}
                {c.level ? ` · ${c.level}` : ''} · {formatPrice(c.price_cents, c.currency)}
              </p>
              {c.summary && (
                <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed font-light text-app-muted">
                  {c.summary}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide(c.id, 'published')}
                disabled={pending && busyId === c.id}
                className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() => decide(c.id, 'draft')}
                disabled={pending && busyId === c.id}
                className="rounded-full border border-app-border bg-app-panel px-5 py-2.5 text-[0.86rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-50"
              >
                Send back
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-[0.88rem] font-light text-app-bad">
          {error}
        </p>
      )}
    </>
  )
}
