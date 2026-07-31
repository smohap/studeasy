'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { gradeSubmission } from '@/app/portal/assignment-actions'
import type { MarkingRow } from '@/lib/assignments'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'

export default function LiveMarking({ rows }: { rows: MarkingRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [marks, setMarks] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)

  function save(row: MarkingRow, release: boolean) {
    setError(null)
    const value = Number(marks)
    if (!Number.isFinite(value)) {
      setError('Enter a mark.')
      return
    }
    start(async () => {
      const result = await gradeSubmission(row.id, value, feedback, release)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpenId(null)
      setMarks('')
      setFeedback('')
      router.refresh()
    })
  }

  return (
    <Panel
      title="Submissions"
      subtitle="Live student work. Nothing reaches a student until you release it."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing handed in yet"
          body="When a student on one of your courses hands work in, it appears here for you to mark and release."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-app-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.95rem] font-medium">
                    {r.student?.full_name ?? 'Student'} — {r.assignment?.title ?? 'Assignment'}
                  </p>
                  <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                    Handed in{' '}
                    {new Date(r.submitted_at).toLocaleString('en-NZ', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {r.assignment ? ` · out of ${r.assignment.max_marks}` : ''}
                  </p>
                </div>
                <StatusChip
                  status={
                    r.released
                      ? { tone: 'good', label: `Released ${r.marks}/${r.assignment?.max_marks}` }
                      : r.marks != null
                        ? { tone: 'warn', label: 'Graded, not released' }
                        : { tone: 'neutral', label: 'Awaiting marking' }
                  }
                />
              </div>

              {r.note && (
                <p className="mt-3 rounded-lg bg-app-subtle p-3 text-[0.87rem] leading-relaxed font-light text-app-ink">
                  {r.note}
                </p>
              )}

              {r.ai_feedback && (
                <p className="mt-3 rounded-lg border border-app-border p-3 text-[0.86rem] leading-relaxed font-light text-app-muted">
                  <span className="font-medium text-app-ink">
                    AI suggestion{r.ai_marks != null ? ` (${r.ai_marks})` : ''}:
                  </span>{' '}
                  {r.ai_feedback}
                </p>
              )}

              {!r.released && (
                <div className="mt-3">
                  {openId === r.id ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <div className="w-28">
                          <label
                            htmlFor={`marks-${r.id}`}
                            className="mb-1.5 block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase"
                          >
                            Mark
                          </label>
                          <input
                            id={`marks-${r.id}`}
                            type="number"
                            min={0}
                            max={r.assignment?.max_marks ?? 100}
                            value={marks}
                            onChange={(e) => setMarks(e.target.value)}
                            className="w-full rounded-xl border border-app-border bg-app px-3 py-2.5 text-[0.92rem] font-light text-app-ink"
                          />
                        </div>
                        <div className="flex-1">
                          <label
                            htmlFor={`fb-${r.id}`}
                            className="mb-1.5 block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase"
                          >
                            Feedback
                          </label>
                          <input
                            id={`fb-${r.id}`}
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="What to fix, in a sentence."
                            className="w-full rounded-xl border border-app-border bg-app px-3 py-2.5 text-[0.92rem] font-light text-app-ink placeholder:text-app-muted"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => save(r, true)}
                          disabled={pending}
                          className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
                        >
                          Save and release
                        </button>
                        <button
                          type="button"
                          onClick={() => save(r, false)}
                          disabled={pending}
                          className="rounded-full border border-app-border px-5 py-2.5 text-[0.86rem] font-medium hover:bg-app-subtle disabled:opacity-50"
                        >
                          Save as draft
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="rounded-full px-4 py-2.5 text-[0.86rem] font-light text-app-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(r.id)
                        setMarks(r.marks?.toString() ?? r.ai_marks?.toString() ?? '')
                        setFeedback(r.feedback ?? r.ai_feedback ?? '')
                      }}
                      className="rounded-full border border-app-border px-5 py-2.5 text-[0.86rem] font-medium hover:bg-app-subtle"
                    >
                      {r.marks != null ? 'Edit and release' : 'Mark this'}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[0.88rem] font-light text-app-bad">
          {error}
        </p>
      )}
    </Panel>
  )
}
