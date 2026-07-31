'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitAssignment } from '@/app/portal/assignment-actions'
import type { StudentAssignment } from '@/lib/assignments'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { Status } from '@/types/dashboard'

function statusOf(a: StudentAssignment): Status {
  if (a.submission?.released && a.submission.marks != null) {
    return { tone: 'good', label: `Marked ${a.submission.marks}/${a.max_marks}` }
  }
  if (a.submission) return { tone: 'neutral', label: 'Submitted' }
  if (a.due_at && new Date(a.due_at) < new Date()) {
    return { tone: 'bad', label: a.allow_late ? 'Overdue' : 'Closed' }
  }
  return { tone: 'warn', label: 'Not started' }
}

export default function LiveAssignments({ assignments }: { assignments: StudentAssignment[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function send(id: string) {
    setError(null)
    start(async () => {
      const result = await submitAssignment(id, note)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpenId(null)
      setNote('')
      router.refresh()
    })
  }

  return (
    <Panel
      title="Your assignments"
      subtitle="From the courses you are enrolled in. This is live data."
    >
      {assignments.length === 0 ? (
        <EmptyState
          title="Nothing set yet"
          body="When a teacher sets work on one of your courses, it appears here with its due date."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {assignments.map((a) => {
            const status = statusOf(a)
            const graded = a.submission?.released && a.submission.marks != null
            return (
              <li key={a.id} className="rounded-xl border border-app-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.95rem] font-medium">{a.title}</p>
                    <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                      {a.course?.title ?? 'Course'}
                      {a.due_at
                        ? ` · due ${new Date(a.due_at).toLocaleDateString('en-NZ', {
                            day: 'numeric',
                            month: 'short',
                          })}`
                        : ''}{' '}
                      · out of {a.max_marks}
                    </p>
                  </div>
                  <StatusChip status={status} />
                </div>

                {a.instructions && (
                  <p className="mt-3 text-[0.87rem] leading-relaxed font-light text-app-muted">
                    {a.instructions}
                  </p>
                )}

                {graded && a.submission?.feedback && (
                  <p className="mt-3 rounded-lg bg-app-subtle p-3 text-[0.87rem] leading-relaxed font-light text-app-ink">
                    <span className="font-medium">Feedback:</span> {a.submission.feedback}
                  </p>
                )}

                {a.submission && !a.submission.released && (
                  <p className="mt-3 text-[0.83rem] font-light text-app-muted">
                    Handed in. Your teacher has not released a mark yet.
                  </p>
                )}

                {!graded && (
                  <div className="mt-3">
                    {openId === a.id ? (
                      <div>
                        <label htmlFor={`note-${a.id}`} className="sr-only">
                          Your answer for {a.title}
                        </label>
                        <textarea
                          id={`note-${a.id}`}
                          rows={4}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Type your working, or describe the file you are handing in."
                          className="w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.92rem] font-light text-app-ink placeholder:text-app-muted"
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => send(a.id)}
                            disabled={pending}
                            className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
                          >
                            {pending ? 'Handing in…' : 'Hand in'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenId(null)}
                            className="rounded-full border border-app-border px-5 py-2.5 text-[0.86rem] font-medium hover:bg-app-subtle"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(a.id)
                          setNote(a.submission?.note ?? '')
                        }}
                        className="rounded-full border border-app-border px-5 py-2.5 text-[0.86rem] font-medium hover:bg-app-subtle"
                      >
                        {a.submission ? 'Replace my answer' : 'Hand in'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
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
