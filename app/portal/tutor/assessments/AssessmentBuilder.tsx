'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addQuestion,
  createAssessment,
  setAssessmentStatus,
} from '@/app/portal/assessment-actions'
import { AUTHORABLE_KINDS, type Assessment, type QuestionKind } from '@/lib/assessment-types'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { StatusTone } from '@/types/dashboard'

const TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  published: 'good',
  archived: 'neutral',
}

export default function AssessmentBuilder({
  assessments,
  courses,
}: {
  assessments: Assessment[]
  courses: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // New assessment
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [courseId, setCourseId] = useState('')
  const [passMark, setPassMark] = useState('50')
  const [attempts, setAttempts] = useState('1')
  const [timeLimit, setTimeLimit] = useState('')
  const [certificate, setCertificate] = useState(false)
  const [negative, setNegative] = useState(false)

  // New question
  const [kind, setKind] = useState<QuestionKind>('mcq')
  const [prompt, setPrompt] = useState('')
  const [marks, setMarks] = useState('1')
  const [optionsText, setOptionsText] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [tolerance, setTolerance] = useState('0')
  const [explanation, setExplanation] = useState('')

  const spec = AUTHORABLE_KINDS.find((k) => k.value === kind)
  const needsOptions = kind === 'mcq' || kind === 'multi_select'
  const needsAnswer = spec?.marking === 'auto'

  function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNote(null)
    start(async () => {
      const r = await createAssessment({
        title,
        description,
        courseId,
        passMarkPct: passMark,
        attemptsAllowed: attempts,
        timeLimitMinutes: timeLimit,
        issuesCertificate: certificate,
        negativeMarking: negative,
      })
      if (r.error) {
        setError(r.error)
        return
      }
      setTitle('')
      setDescription('')
      setNote('Assessment created as a draft.')
      router.refresh()
    })
  }

  function addOne(e: React.FormEvent) {
    e.preventDefault()
    if (!openId) return
    setError(null)
    setNote(null)
    start(async () => {
      const r = await addQuestion({
        assessmentId: openId,
        kind,
        prompt,
        marks,
        optionsText,
        answerText,
        tolerance,
        explanation,
      })
      if (r.error) {
        setError(r.error)
        return
      }
      setPrompt('')
      setOptionsText('')
      setAnswerText('')
      setExplanation('')
      setNote('Question added.')
      router.refresh()
    })
  }

  function publish(id: string, status: 'draft' | 'published') {
    setError(null)
    start(async () => {
      const r = await setAssessmentStatus(id, status)
      if (r.error) setError(r.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          Assessments
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          Objective questions are marked automatically. Written answers come to you.
        </p>
      </header>

      <Panel title="Your assessments">
        {assessments.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            body="Create one below, add questions, then publish it. A draft is invisible to students."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {assessments.map((a) => (
              <li key={a.id} className="rounded-xl border border-app-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.95rem] font-medium">{a.title}</p>
                    <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                      Pass at {a.pass_mark_pct}% · {a.attempts_allowed}{' '}
                      {a.attempts_allowed === 1 ? 'attempt' : 'attempts'}
                      {a.issues_certificate ? ' · issues a certificate' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={{ tone: TONE[a.status], label: a.status }} />
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === a.id ? null : a.id)}
                      className="rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-medium hover:bg-app-subtle"
                    >
                      {openId === a.id ? 'Close' : 'Add questions'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        publish(a.id, a.status === 'published' ? 'draft' : 'published')
                      }
                      disabled={pending}
                      className="rounded-full bg-accent px-4 py-2 text-[0.84rem] font-medium text-[#100c00] disabled:opacity-50"
                    >
                      {a.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                  </div>
                </div>

                {openId === a.id && (
                  <form
                    onSubmit={addOne}
                    className="mt-5 flex flex-col gap-4 border-t border-app-border pt-5"
                  >
                    <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                      <div>
                        <label htmlFor="q-kind" className={label}>
                          Question type
                        </label>
                        <select
                          id="q-kind"
                          value={kind}
                          onChange={(e) => setKind(e.target.value as QuestionKind)}
                          className={input}
                        >
                          {AUTHORABLE_KINDS.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label} ({k.marking === 'auto' ? 'auto-marked' : 'you mark'})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="q-marks" className={label}>
                          Marks
                        </label>
                        <input
                          id="q-marks"
                          type="number"
                          min="1"
                          value={marks}
                          onChange={(e) => setMarks(e.target.value)}
                          className={input}
                        />
                      </div>
                    </div>

                    {spec?.hint && (
                      <p className="text-[0.82rem] font-light text-app-muted">{spec.hint}</p>
                    )}

                    <div>
                      <label htmlFor="q-prompt" className={label}>
                        Question
                      </label>
                      <textarea
                        id="q-prompt"
                        rows={2}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        required
                        className={input}
                      />
                    </div>

                    {needsOptions && (
                      <div>
                        <label htmlFor="q-options" className={label}>
                          Options — one per line
                        </label>
                        <textarea
                          id="q-options"
                          rows={4}
                          value={optionsText}
                          onChange={(e) => setOptionsText(e.target.value)}
                          className={input}
                        />
                      </div>
                    )}

                    {needsAnswer && (
                      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                        <div>
                          <label htmlFor="q-answer" className={label}>
                            {kind === 'multi_select'
                              ? 'Correct options — one per line'
                              : kind === 'fill_blank'
                                ? 'Accepted answers — one per line'
                                : 'Correct answer'}
                          </label>
                          <textarea
                            id="q-answer"
                            rows={
                              kind === 'mcq' || kind === 'numerical' || kind === 'true_false'
                                ? 1
                                : 3
                            }
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            placeholder={kind === 'true_false' ? 'true' : ''}
                            className={input}
                          />
                        </div>
                        {kind === 'numerical' && (
                          <div>
                            <label htmlFor="q-tol" className={label}>
                              Tolerance
                            </label>
                            <input
                              id="q-tol"
                              type="number"
                              step="any"
                              min="0"
                              value={tolerance}
                              onChange={(e) => setTolerance(e.target.value)}
                              className={input}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label htmlFor="q-expl" className={label}>
                        Explanation shown afterwards (optional)
                      </label>
                      <input
                        id="q-expl"
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        className={input}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={pending}
                      className="self-start rounded-full bg-accent px-6 py-3 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-50"
                    >
                      {pending ? 'Adding…' : 'Add question'}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="New assessment">
        <form onSubmit={create} className="flex flex-col gap-5">
          <div>
            <label htmlFor="a-title" className={label}>
              Title
            </label>
            <input
              id="a-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Quadratics — end of topic test"
              className={input}
            />
          </div>

          <div>
            <label htmlFor="a-desc" className={label}>
              Description
            </label>
            <input
              id="a-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={input}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="a-course" className={label}>
                Course
              </label>
              <select
                id="a-course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className={input}
              >
                <option value="">Standalone — anyone signed in</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="a-time" className={label}>
                Time limit (minutes)
              </label>
              <input
                id="a-time"
                type="number"
                min="1"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                placeholder="No limit"
                className={input}
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="a-pass" className={label}>
                Pass mark (%)
              </label>
              <input
                id="a-pass"
                type="number"
                min="0"
                max="100"
                value={passMark}
                onChange={(e) => setPassMark(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label htmlFor="a-attempts" className={label}>
                Attempts allowed
              </label>
              <input
                id="a-attempts"
                type="number"
                min="1"
                value={attempts}
                onChange={(e) => setAttempts(e.target.value)}
                className={input}
              />
            </div>
          </div>

          <label className="flex items-center gap-3 text-[0.9rem] font-light text-app-ink">
            <input
              type="checkbox"
              checked={certificate}
              onChange={(e) => setCertificate(e.target.checked)}
              className="h-4 w-4 accent-[#E3B341]"
            />
            Issue a certificate on passing
          </label>

          <label className="flex items-center gap-3 text-[0.9rem] font-light text-app-ink">
            <input
              type="checkbox"
              checked={negative}
              onChange={(e) => setNegative(e.target.checked)}
              className="h-4 w-4 accent-[#E3B341]"
            />
            Negative marking — a wrong answer costs a mark
          </label>

          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create draft'}
          </button>
        </form>
      </Panel>

      {note && (
        <p role="status" className="text-[0.88rem] font-medium text-app-good">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[0.88rem] font-light text-app-bad">
          {error}
        </p>
      )}
    </div>
  )
}

const label =
  'mb-2 block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase'
const input =
  'w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted'
