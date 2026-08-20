'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { startAttempt, submitAttempt } from '@/app/portal/assessment-actions'
import type { Assessment, AttemptResult, PaperQuestion } from '@/lib/assessment-types'

type Responses = Record<string, string | string[]>

export default function TakePaper({
  assessment,
  paper,
}: {
  assessment: Assessment
  paper: PaperQuestion[]
}) {
  const [pending, start] = useTransition()
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [responses, setResponses] = useState<Responses>({})
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const total = paper.reduce((sum, q) => sum + q.marks, 0)

  function begin() {
    setError(null)
    start(async () => {
      const r = await startAttempt(assessment.id)
      if (r.error) {
        setError(r.error)
        return
      }
      setAttemptId(r.attemptId ?? null)
    })
  }

  function finish() {
    if (!attemptId) return
    setError(null)
    start(async () => {
      const r = await submitAttempt(
        attemptId,
        paper.map((q) => ({ question_id: q.id, response: responses[q.id] ?? null })),
      )
      if (r.error) {
        setError(r.error)
        return
      }
      setResult(r.result ?? null)
    })
  }

  function set(id: string, value: string | string[]) {
    setResponses((r) => ({ ...r, [id]: value }))
  }

  function toggle(id: string, option: string) {
    const current = (responses[id] as string[]) ?? []
    set(
      id,
      current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
    )
  }

  // ---- Finished -----------------------------------------------------------
  if (result) {
    const pct =
      result.max_marks > 0 ? Math.round((result.auto_marks / result.max_marks) * 100) : 0
    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-8">
        {result.needs_marking ? (
          <Clock size={26} aria-hidden className="text-accent" strokeWidth={1.6} />
        ) : result.passed ? (
          <CheckCircle2 size={26} aria-hidden className="text-accent" strokeWidth={1.6} />
        ) : (
          <XCircle size={26} aria-hidden className="text-[#E88A8A]" strokeWidth={1.6} />
        )}

        <h2 className="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink">
          {result.needs_marking
            ? 'Handed in — some of it needs your teacher'
            : result.passed
              ? 'Passed'
              : 'Not passed this time'}
        </h2>

        <p className="mt-3 text-[0.98rem] leading-relaxed font-light text-ink-dim">
          {result.needs_marking ? (
            <>
              The auto-marked part scored {result.auto_marks} of {result.max_marks}. Your
              written answers are with your teacher, so the final mark and any certificate
              follow once they release it.
            </>
          ) : (
            <>
              You scored {result.auto_marks} of {result.max_marks} ({pct}%). The pass mark is{' '}
              {assessment.pass_mark_pct}%.
            </>
          )}
        </p>

        {!result.needs_marking && result.passed && assessment.issues_certificate && (
          <p className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.07] p-4 text-[0.9rem] leading-relaxed font-light text-ink">
            Your certificate has been issued — it is on your achievements page.
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/portal/student/achievements"
            className="rounded-full bg-accent px-7 py-3 text-[0.92rem] font-medium text-[#100c00]"
          >
            See achievements
          </Link>
          <Link
            href="/portal/student"
            className="rounded-full border border-hairline px-7 py-3 text-[0.92rem] font-light text-ink"
          >
            Back to portal
          </Link>
        </div>
      </div>
    )
  }

  // ---- Not started --------------------------------------------------------
  if (!attemptId) {
    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-8">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Fact label="Questions" value={String(paper.length)} />
          <Fact label="Total marks" value={String(total)} />
          <Fact label="Pass mark" value={`${assessment.pass_mark_pct}%`} />
          <Fact
            label="Time limit"
            value={
              assessment.time_limit_minutes ? `${assessment.time_limit_minutes} min` : 'None'
            }
          />
        </dl>

        {assessment.negative_marking && (
          <p className="mt-6 text-[0.88rem] leading-relaxed font-light text-ink-dim">
            Negative marking is on: a wrong answer costs a mark, so leave one blank if you
            genuinely do not know.
          </p>
        )}

        <button
          type="button"
          onClick={begin}
          disabled={pending || paper.length === 0}
          className="mt-7 rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Starting…' : 'Start'}
        </button>

        {paper.length === 0 && (
          <p className="mt-4 text-[0.9rem] font-light text-ink-dim">
            This assessment has no questions yet.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
            {error}
          </p>
        )}
      </div>
    )
  }

  // ---- In progress --------------------------------------------------------
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        finish()
      }}
    >
      <ol className="flex flex-col gap-5">
        {paper.map((q, i) => (
          <li key={q.id} className="rounded-2xl border border-hairline bg-base-raised p-6">
            <fieldset>
              <legend className="text-[1rem] leading-snug font-medium text-ink">
                <span className="text-ink-dim">{i + 1}. </span>
                {q.prompt}
                <span className="ml-2 text-[0.8rem] font-light text-ink-dim">
                  ({q.marks} {q.marks === 1 ? 'mark' : 'marks'})
                </span>
              </legend>

              <div className="mt-4">
                {(q.kind === 'mcq' || q.kind === 'true_false') && (
                  <div className="flex flex-col gap-2">
                    {(q.payload.options ?? []).map((o) => (
                      <label
                        key={o}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline px-4 py-3 text-[0.94rem] font-light text-ink"
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value={o}
                          checked={responses[q.id] === o}
                          onChange={() => set(q.id, o)}
                          className="h-4 w-4 accent-[#E3B341]"
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                )}

                {q.kind === 'multi_select' && (
                  <div className="flex flex-col gap-2">
                    {(q.payload.options ?? []).map((o) => (
                      <label
                        key={o}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline px-4 py-3 text-[0.94rem] font-light text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={((responses[q.id] as string[]) ?? []).includes(o)}
                          onChange={() => toggle(q.id, o)}
                          className="h-4 w-4 accent-[#E3B341]"
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                )}

                {(q.kind === 'numerical' ||
                  q.kind === 'fill_blank' ||
                  q.kind === 'short_answer') && (
                  <input
                    type={q.kind === 'numerical' ? 'number' : 'text'}
                    step="any"
                    value={(responses[q.id] as string) ?? ''}
                    onChange={(e) => set(q.id, e.target.value)}
                    aria-label={`Answer for question ${i + 1}`}
                    className="w-full rounded-xl border border-hairline bg-base px-4 py-3 text-[0.95rem] font-light text-ink"
                  />
                )}

                {q.kind === 'essay' && (
                  <textarea
                    rows={6}
                    value={(responses[q.id] as string) ?? ''}
                    onChange={(e) => set(q.id, e.target.value)}
                    aria-label={`Answer for question ${i + 1}`}
                    className="w-full rounded-xl border border-hairline bg-base px-4 py-3 text-[0.95rem] font-light text-ink"
                  />
                )}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-hairline pt-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Marking…' : 'Hand in'}
        </button>
        <span className="text-[0.86rem] font-light text-ink-dim">
          {Object.keys(responses).length} of {paper.length} answered
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </form>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 text-[1rem] font-medium text-ink">{value}</dd>
    </div>
  )
}
