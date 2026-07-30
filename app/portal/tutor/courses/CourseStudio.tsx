'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCourse, submitCourseForReview } from '@/app/shop/actions'
import { STATUS_LABEL, formatPrice, type Course } from '@/lib/catalog'
import { SUBJECTS, YEAR_LEVELS } from '@/lib/curriculum'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { StatusTone } from '@/types/dashboard'

const KINDS = [
  { value: 'course', label: 'Course' },
  { value: 'class', label: 'Class' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'test', label: 'Test' },
]

const FORMATS = [
  { value: 'online', label: 'Online' },
  { value: 'in_person', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'self_paced', label: 'Self-paced' },
]

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  pending_review: 'warn',
  published: 'good',
  archived: 'neutral',
}

export default function CourseStudio({
  courses,
  approved,
}: {
  courses: Course[]
  approved: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('')
  const [summary, setSummary] = useState('')
  const [kind, setKind] = useState('course')
  const [format, setFormat] = useState('online')
  const [price, setPrice] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    start(async () => {
      const result = await createCourse({
        title,
        subject,
        level,
        summary,
        kind,
        format,
        priceDollars: price,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setTitle('')
      setSummary('')
      setPrice('')
      setSaved(true)
      router.refresh()
    })
  }

  function publish(id: string) {
    setError(null)
    start(async () => {
      const result = await submitCourseForReview(id)
      if (result.error) setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          Course studio
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          Create something to sell. Drafts stay private until an administrator approves
          them.
        </p>
      </header>

      {!approved && (
        <p
          role="alert"
          className="rounded-2xl border border-app-warn/30 bg-app-warn-bg p-5 text-[0.9rem] leading-relaxed font-light text-app-ink"
        >
          Your teacher account is still awaiting approval. You can draft courses now, but
          you cannot publish until an administrator approves you.
        </p>
      )}

      <Panel title="Create a new course">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Course title" htmlFor="title">
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Year 12 Calculus Foundations"
              className="w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Subject" htmlFor="subject">
              <select
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Level" htmlFor="level">
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink"
              >
                <option value="">All levels</option>
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Summary" htmlFor="summary">
            <textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="What a student actually gets, in a sentence or two."
              className="w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Chips legend="Type" options={KINDS} value={kind} onChange={setKind} />
            <Chips legend="Format" options={FORMATS} value={format} onChange={setFormat} />
            <Field label="Price (NZD)" htmlFor="price">
              <input
                id="price"
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="120"
                className="w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted"
              />
              <p className="mt-2 text-[0.8rem] font-light text-app-muted">
                Leave blank or 0 to offer it free.
              </p>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save as draft'}
            </button>
            {saved && (
              <span role="status" className="text-[0.86rem] font-medium text-app-good">
                Draft saved
              </span>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[0.88rem] font-light text-app-bad">
              {error}
            </p>
          )}
        </form>
      </Panel>

      <Panel title="My courses">
        {courses.length === 0 ? (
          <EmptyState
            title="Nothing created yet"
            body="Courses you create appear here with their status. Nothing is visible to students until it is published."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {courses.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-app-border p-4"
              >
                <div>
                  <p className="text-[0.95rem] font-medium">{c.title}</p>
                  <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                    {c.subject}
                    {c.level ? ` · ${c.level}` : ''} ·{' '}
                    {formatPrice(c.price_cents, c.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusChip
                    status={{
                      tone: STATUS_TONE[c.status] ?? 'neutral',
                      label: STATUS_LABEL[c.status],
                    }}
                  />
                  {c.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => publish(c.id)}
                      disabled={pending || !approved}
                      className="rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-medium hover:bg-app-subtle disabled:opacity-40"
                    >
                      Submit for approval
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function Chips({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`rounded-full border px-3.5 py-2 text-[0.84rem] transition-colors ${
                on
                  ? 'border-app-ink bg-app-ink font-medium text-white'
                  : 'border-app-border font-light text-app-ink hover:bg-app-subtle'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
