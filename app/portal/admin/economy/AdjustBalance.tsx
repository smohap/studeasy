'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adjustBalance } from '@/app/portal/economy-actions'
import type { CoinEntry } from '@/lib/economy-types'

export type StudentOption = { id: string; name: string }
export type AdjustmentRow = CoinEntry & { student_name: string }

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

/*
 * Not one of the files the brief named for Task 24, but adjustBalance() has
 * nowhere else to be called from — the brief's three sections are "the rate
 * table, the challenge list with a form, and recent adjustments read from
 * coin_ledger", and the third of those needs a form to produce the rows it
 * lists. Kept small and separate rather than folded into RateEditor or
 * ChallengeEditor, which are about something else entirely.
 */
export default function AdjustBalance({
  students,
  adjustments,
}: {
  students: StudentOption[]
  adjustments: AdjustmentRow[]
}) {
  const router = useRouter()
  const [studentId, setStudentId] = useState('')
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    setDone(false)

    const amount = Number(delta)
    if (!studentId) {
      setError('Choose a student.')
      return
    }
    if (!Number.isInteger(amount) || amount === 0) {
      setError('Enter a non-zero whole number of coins.')
      return
    }
    if (!note.trim()) {
      setError('Say why you are adjusting this balance.')
      return
    }

    start(async () => {
      const res = await adjustBalance(studentId, amount, note.trim())
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(true)
      setDelta('')
      setNote('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border border-app-border p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="ab-student">
              Student
            </label>
            <select
              id="ab-student"
              className={`${field} mt-1.5`}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ab-delta">
              Coins — negative to remove
            </label>
            <input
              id="ab-delta"
              type="number"
              className={`${field} mt-1.5`}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="ab-note">
              Note — required, kept on the record
            </label>
            <input
              id="ab-note"
              className={`${field} mt-1.5`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this adjustment"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[0.85rem] font-light text-app-bad">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-[0.85rem] font-light text-app-good">
            Adjustment recorded.
          </p>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="self-start rounded-lg bg-app-ink px-4 py-2 text-[0.86rem] font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Adjust balance'}
        </button>
      </div>

      {adjustments.length === 0 ? (
        <p className="text-[0.88rem] font-light text-app-muted">
          No manual adjustment has been made.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {adjustments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-3.5"
            >
              <div className="min-w-0">
                <p className="text-[0.9rem] font-medium text-app-ink">{a.student_name}</p>
                {a.note && (
                  <p className="mt-0.5 text-[0.8rem] font-light text-app-muted">{a.note}</p>
                )}
                <p className="mt-0.5 text-[0.78rem] font-light text-app-muted">
                  {new Date(a.created_at).toLocaleDateString('en-NZ', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <span
                className={`text-[0.9rem] font-semibold ${
                  a.delta >= 0 ? 'text-app-good' : 'text-app-bad'
                }`}
              >
                {a.delta >= 0 ? '+' : ''}
                {a.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
