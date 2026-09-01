'use client'

import { useState, useTransition } from 'react'
import { Download, FileText } from 'lucide-react'
import { EmptyState, Panel } from '@/components/app/Ui'
import type { AttemptToMark } from '@/lib/assessments-data'
import { markWrittenAnswer, releaseAttempt } from '@/app/portal/assessment-actions'

/**
 * Assessment attempts waiting on a person.
 *
 * Separate from LiveMarking, which handles assignment hand-ins. The two look
 * alike but sit on different tables with different release calls, and merging
 * them would mean one component holding two of everything.
 */
export default function MarkAttempts({ attempts }: { attempts: AttemptToMark[] }) {
  return (
    <Panel
      title="Assessments to mark"
      subtitle="Written answers, uploaded papers and classroom sittings. Releasing sends the result to the student."
    >
      {attempts.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          body="Anything a machine cannot mark — an essay, an uploaded paper, a sitting you ran in person — turns up here."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {attempts.map((a) => (
            <AttemptCard key={a.id} attempt={a} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AttemptCard({ attempt: a }: { attempt: AttemptToMark }) {
  const [extra, setExtra] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // What has already been awarded per question, so the total added at the end
  // does not have to be worked out twice.
  const perQuestion = a.written.reduce((sum, w) => sum + (w.awarded ?? 0), 0)

  return (
    <li className="rounded-xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-medium text-app-ink">{a.studentName}</p>
          <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
            {a.assessmentTitle} ·{' '}
            {new Date(a.submittedAt).toLocaleString('en-NZ', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {a.autoMarks != null && ` · ${a.autoMarks} auto-marked`}
          </p>
          {a.autoClosed && (
            <p className="mt-1 text-[0.82rem] font-medium text-app-warn">
              Closed automatically when time ran out — they did not hand it in.
            </p>
          )}
        </div>

        {a.uploadUrl ? (
          <a
            href={a.uploadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-app-border px-4 py-2 text-[0.83rem] font-medium text-app-ink hover:bg-app-subtle"
          >
            <Download size={14} aria-hidden />
            {a.uploadName ?? 'Their answers'}
          </a>
        ) : (
          a.uploadName && (
            <span className="inline-flex items-center gap-2 text-[0.83rem] font-light text-app-muted">
              <FileText size={14} aria-hidden />
              {a.uploadName} — link unavailable
            </span>
          )
        )}
      </div>

      {a.written.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3 border-t border-app-border pt-4">
          {a.written.map((w) => (
            <WrittenRow key={w.id} answer={w} />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-app-border pt-4">
        <div>
          <label
            htmlFor={`extra-${a.id}`}
            className="block text-[0.78rem] font-medium text-app-muted"
          >
            Marks to add on top
          </label>
          <input
            id={`extra-${a.id}`}
            type="number"
            min={0}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="mt-1.5 w-32 rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] text-app-ink"
          />
        </div>

        {a.written.length > 0 && (
          <p className="pb-2 text-[0.82rem] font-light text-app-muted">
            {perQuestion} already awarded per question.
          </p>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await releaseAttempt(a.id, Number(extra || '0'))
              setError(res.error)
            })
          }
          className="ml-auto rounded-full bg-accent px-6 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-60"
        >
          {pending ? 'Releasing…' : 'Release the result'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}

function WrittenRow({ answer: w }: { answer: AttemptToMark['written'][number] }) {
  const [marks, setMarks] = useState(String(w.awarded ?? ''))
  const [comment, setComment] = useState(w.comment ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <li className="rounded-lg bg-app-subtle p-3">
      <p className="text-[0.88rem] font-medium text-app-ink">
        {w.prompt}{' '}
        <span className="font-light text-app-muted">
          ({w.marks} {w.marks === 1 ? 'mark' : 'marks'})
        </span>
      </p>
      <p className="mt-2 text-[0.87rem] leading-relaxed font-light whitespace-pre-line text-app-muted">
        {w.response}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label
            htmlFor={`m-${w.id}`}
            className="block text-[0.75rem] font-medium text-app-muted"
          >
            Marks
          </label>
          <input
            id={`m-${w.id}`}
            type="number"
            min={0}
            max={w.marks}
            value={marks}
            onChange={(e) => {
              setMarks(e.target.value)
              setSaved(false)
            }}
            className="mt-1 w-20 rounded-lg border border-app-border bg-app px-2 py-1.5 text-[0.85rem] text-app-ink"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`c-${w.id}`}
            className="block text-[0.75rem] font-medium text-app-muted"
          >
            Comment
          </label>
          <input
            id={`c-${w.id}`}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              setSaved(false)
            }}
            placeholder="What would have earned full marks?"
            className="mt-1 w-full rounded-lg border border-app-border bg-app px-3 py-1.5 text-[0.85rem] text-app-ink placeholder:text-app-muted"
          />
        </div>
        <button
          type="button"
          disabled={pending || marks === ''}
          onClick={() =>
            start(async () => {
              const res = await markWrittenAnswer(w.id, Number(marks), comment)
              setError(res.error)
              setSaved(!res.error)
            })
          }
          className="rounded-full border border-app-border px-4 py-1.5 text-[0.82rem] font-medium text-app-ink hover:bg-app-panel disabled:opacity-60"
        >
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[0.82rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}
