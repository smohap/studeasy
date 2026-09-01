'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addQuestion,
  createAssessment,
  setAssessmentStatus,
  updateAssessment,
  type NewAssessment,
} from '@/app/portal/assessment-actions'
import {
  AUTHORABLE_KINDS,
  DELIVERY_HINT,
  DELIVERY_LABEL,
  type Assessment,
  type Delivery,
  type QuestionKind,
} from '@/lib/assessment-types'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { StatusTone } from '@/types/dashboard'

const TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  published: 'good',
  archived: 'neutral',
}

const BLANK: NewAssessment = {
  title: '',
  description: '',
  courseId: '',
  classId: '',
  delivery: 'online',
  priceDollars: '0',
  location: '',
  meetingUrl: '',
  opensAt: '',
  closesAt: '',
  paperUrl: '',
  allowUpload: false,
  passMarkPct: '50',
  attemptsAllowed: '1',
  timeLimitMinutes: '',
  issuesCertificate: false,
  negativeMarking: false,
}

/** An ISO timestamp back into what a datetime-local input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AssessmentBuilder({
  assessments,
  courses,
  classes,
}: {
  assessments: Assessment[]
  courses: { id: string; title: string }[]
  /** The teacher's own classes — linking makes it free for their students. */
  classes: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // One object rather than a state per field — there are seventeen of them now.
  const [form, setForm] = useState<NewAssessment>(BLANK)
  /** Null while creating; the id being edited otherwise. */
  const [editingId, setEditingId] = useState<string | null>(null)

  const set = <K extends keyof NewAssessment>(k: K, v: NewAssessment[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function startEdit(a: Assessment) {
    setEditingId(a.id)
    setError(null)
    setNote(null)
    setForm({
      title: a.title,
      description: a.description ?? '',
      courseId: a.course_id ?? '',
      classId: a.class_id ?? '',
      delivery: a.delivery,
      priceDollars: (a.price_cents / 100).toFixed(2),
      location: a.location ?? '',
      meetingUrl: a.meeting_url ?? '',
      opensAt: toLocalInput(a.opens_at),
      closesAt: toLocalInput(a.closes_at),
      paperUrl: a.paper_url ?? '',
      allowUpload: a.allow_upload,
      passMarkPct: String(a.pass_mark_pct),
      attemptsAllowed: String(a.attempts_allowed),
      timeLimitMinutes: a.time_limit_minutes ? String(a.time_limit_minutes) : '',
      issuesCertificate: a.issues_certificate,
      negativeMarking: a.negative_marking,
    })
    document.getElementById('assessment-form')?.scrollIntoView({ behavior: 'smooth' })
  }

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

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNote(null)
    start(async () => {
      const r = editingId
        ? await updateAssessment(editingId, form)
        : await createAssessment(form)
      if (r.error) {
        setError(r.error)
        return
      }
      setNote(editingId ? 'Saved.' : 'Assessment created as a draft.')
      setForm(BLANK)
      setEditingId(null)
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
                      {DELIVERY_LABEL[a.delivery]} ·{' '}
                      {a.price_cents === 0 ? 'Free' : `$${(a.price_cents / 100).toFixed(2)}`}{' '}
                      · pass at {a.pass_mark_pct}% · {a.attempts_allowed}{' '}
                      {a.attempts_allowed === 1 ? 'attempt' : 'attempts'}
                      {a.time_limit_minutes ? ` · ${a.time_limit_minutes} min` : ''}
                      {a.class_id ? ' · free for its class' : ''}
                      {a.issues_certificate ? ' · issues a certificate' : ''}
                    </p>
                    {a.closes_at && (
                      <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                        Closes{' '}
                        {new Date(a.closes_at).toLocaleString('en-NZ', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={{ tone: TONE[a.status], label: a.status }} />
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-medium hover:bg-app-subtle"
                    >
                      Edit
                    </button>
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

      <Panel
        title={editingId ? 'Edit assessment' : 'New assessment'}
        subtitle={DELIVERY_HINT[form.delivery]}
      >
        <form id="assessment-form" onSubmit={save} className="flex flex-col gap-5">
          <fieldset>
            <legend className={label}>How is it sat?</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DELIVERY_LABEL) as Delivery[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={form.delivery === d}
                  onClick={() => set('delivery', d)}
                  className={`rounded-full border px-5 py-2.5 text-[0.88rem] transition-colors ${
                    form.delivery === d
                      ? 'border-accent bg-accent/15 font-medium text-accent-deep'
                      : 'border-app-border font-light text-app-ink hover:bg-app-subtle'
                  }`}
                >
                  {DELIVERY_LABEL[d]}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="a-title" className={label}>
              Title
            </label>
            <input
              id="a-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
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
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
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
                value={form.courseId}
                onChange={(e) => set('courseId', e.target.value)}
                className={input}
              >
                <option value="">Not part of a course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="a-class" className={label}>
                Class
              </label>
              <select
                id="a-class"
                value={form.classId}
                onChange={(e) => set('classId', e.target.value)}
                aria-describedby="a-class-hint"
                className={input}
              >
                <option value="">Not part of a class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <p id="a-class-hint" className="mt-2 text-[0.8rem] font-light text-app-muted">
                Linked to a class, it is free for everyone registered in it.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="a-price" className={label}>
                Price (NZD, 0 for free)
              </label>
              <input
                id="a-price"
                type="number"
                min="0"
                step="0.01"
                value={form.priceDollars}
                onChange={(e) => set('priceDollars', e.target.value)}
                className={input}
              />
            </div>
            {form.delivery === 'online' && (
              <div>
                <label htmlFor="a-time" className={label}>
                  Time limit (minutes)
                </label>
                <input
                  id="a-time"
                  type="number"
                  min="1"
                  value={form.timeLimitMinutes}
                  onChange={(e) => set('timeLimitMinutes', e.target.value)}
                  placeholder="No limit"
                  aria-describedby="a-time-hint"
                  className={input}
                />
                <p id="a-time-hint" className="mt-2 text-[0.8rem] font-light text-app-muted">
                  The clock starts when they begin and does not stop — leaving the page
                  does not pause it.
                </p>
              </div>
            )}
          </div>

          {form.delivery === 'classroom' && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="a-location" className={label}>
                  Location
                </label>
                <input
                  id="a-location"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="Room 4, Newmarket"
                  className={input}
                />
              </div>
            </div>
          )}

          {form.delivery === 'offline' && (
            <>
              <div>
                <label htmlFor="a-paper" className={label}>
                  Link to the paper
                </label>
                <input
                  id="a-paper"
                  value={form.paperUrl}
                  onChange={(e) => set('paperUrl', e.target.value)}
                  placeholder="https://…"
                  aria-describedby="a-paper-hint"
                  className={input}
                />
                <p
                  id="a-paper-hint"
                  className="mt-2 text-[0.8rem] font-light text-app-muted"
                >
                  Students download this to work from.
                </p>
              </div>

              <label className="flex items-center gap-3 text-[0.9rem] font-light text-app-ink">
                <input
                  type="checkbox"
                  checked={form.allowUpload}
                  onChange={(e) => set('allowUpload', e.target.checked)}
                  className="h-4 w-4 accent-[#E3B341]"
                />
                Let students hand answers back as a PDF or Word file
              </label>
            </>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="a-opens" className={label}>
                {form.delivery === 'classroom' ? 'Sitting starts' : 'Opens'}
              </label>
              <input
                id="a-opens"
                type="datetime-local"
                value={form.opensAt}
                onChange={(e) => set('opensAt', e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label htmlFor="a-closes" className={label}>
                {form.delivery === 'offline' ? 'Hand in by' : 'Closes'}
              </label>
              <input
                id="a-closes"
                type="datetime-local"
                value={form.closesAt}
                onChange={(e) => set('closesAt', e.target.value)}
                aria-describedby="a-closes-hint"
                className={input}
              />
              <p id="a-closes-hint" className="mt-2 text-[0.8rem] font-light text-app-muted">
                Anything still open is submitted automatically at this time.
              </p>
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
                value={form.passMarkPct}
                onChange={(e) => set('passMarkPct', e.target.value)}
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
                value={form.attemptsAllowed}
                onChange={(e) => set('attemptsAllowed', e.target.value)}
                className={input}
              />
            </div>
          </div>

          <label className="flex items-center gap-3 text-[0.9rem] font-light text-app-ink">
            <input
              type="checkbox"
              checked={form.issuesCertificate}
              onChange={(e) => set('issuesCertificate', e.target.checked)}
              className="h-4 w-4 accent-[#E3B341]"
            />
            Issue a certificate on passing
          </label>

          {form.delivery === 'online' && (
            <label className="flex items-center gap-3 text-[0.9rem] font-light text-app-ink">
              <input
                type="checkbox"
                checked={form.negativeMarking}
                onChange={(e) => set('negativeMarking', e.target.checked)}
                className="h-4 w-4 accent-[#E3B341]"
              />
              Negative marking — a wrong answer costs a mark
            </label>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-50"
            >
              {pending ? 'Saving…' : editingId ? 'Save changes' : 'Create draft'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(BLANK)
                }}
                className="rounded-full border border-app-border px-6 py-3 text-[0.9rem] font-light text-app-ink"
              >
                Cancel
              </button>
            )}
          </div>
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
