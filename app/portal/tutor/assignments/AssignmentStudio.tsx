'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ClipboardPlus, Trash2 } from 'lucide-react'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { TeacherAssignment } from '@/lib/assignments'
import type { Status } from '@/types/dashboard'
import {
  createAssignment,
  deleteAssignment,
  setAssignmentStatus,
  type NewAssignment,
} from '@/app/portal/assignment-actions'

export type ParentOption = {
  /** `course:<id>` or `class:<id>` — the shape createAssignment() expects. */
  value: string
  label: string
  group: 'Courses' | 'Classes'
}

const BLANK: NewAssignment = {
  title: '',
  instructions: '',
  parent: '',
  dueAt: '',
  maxMarks: '20',
  allowLate: true,
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

function statusOf(a: TeacherAssignment): Status {
  if (a.status === 'draft') return { tone: 'warn', label: 'Draft' }
  if (a.status === 'archived') return { tone: 'neutral', label: 'Archived' }
  if (a.ungradedCount > 0) return { tone: 'bad', label: `${a.ungradedCount} to mark` }
  return { tone: 'good', label: 'Live' }
}

export default function AssignmentStudio({
  assignments,
  parents,
}: {
  assignments: TeacherAssignment[]
  parents: ParentOption[]
}) {
  const [form, setForm] = useState<NewAssignment>(BLANK)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const courses = parents.filter((p) => p.group === 'Courses')
  const classes = parents.filter((p) => p.group === 'Classes')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await createAssignment(form)
      if (res.error) setError(res.error)
      else setForm(BLANK)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Assignments
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Set work against a course or a single class. It stays a draft until you publish
          it, and handed-in work turns up in Marking.
        </p>
      </div>

      <Panel
        title="Set an assignment"
        subtitle="Students see it once you publish, not before."
      >
        {parents.length === 0 ? (
          <EmptyState
            title="Nothing to attach work to"
            body="Create a course or schedule a class first — an assignment has to belong to one of them."
            action={
              <Link
                href="/portal/tutor/classes"
                className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
              >
                Schedule a class
              </Link>
            }
          />
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="a-title">
                Title
              </label>
              <input
                id="a-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Integration by parts — practice set 2"
                className={`${field} mt-1.5`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="a-parent">
                Set for
              </label>
              <select
                id="a-parent"
                value={form.parent}
                onChange={(e) => setForm({ ...form, parent: e.target.value })}
                className={`${field} mt-1.5`}
              >
                <option value="">Choose a course or class…</option>
                {courses.length > 0 && (
                  <optgroup label="Courses">
                    {courses.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {classes.length > 0 && (
                  <optgroup label="Classes">
                    {classes.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="a-instructions">
                Instructions
              </label>
              <textarea
                id="a-instructions"
                rows={4}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="What to do, and what you want to see in the working."
                className={`${field} mt-1.5`}
              />
            </div>

            <div>
              <label className={label} htmlFor="a-due">
                Due (optional)
              </label>
              <input
                id="a-due"
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                className={`${field} mt-1.5`}
              />
            </div>

            <div>
              <label className={label} htmlFor="a-marks">
                Marks available
              </label>
              <input
                id="a-marks"
                type="number"
                min={1}
                value={form.maxMarks}
                onChange={(e) => setForm({ ...form, maxMarks: e.target.value })}
                className={`${field} mt-1.5`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2.5 text-[0.88rem] font-light text-app-ink">
                <input
                  type="checkbox"
                  checked={form.allowLate}
                  onChange={(e) => setForm({ ...form, allowLate: e.target.checked })}
                  className="h-4 w-4 rounded border-app-border"
                />
                Accept work after the due date
              </label>
            </div>

            {error && (
              <p role="alert" className="text-[0.85rem] text-app-bad sm:col-span-2">
                {error}
              </p>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-60"
              >
                <ClipboardPlus size={16} aria-hidden />
                {pending ? 'Saving…' : 'Create assignment'}
              </button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="Work you have set">
        {assignments.length === 0 ? (
          <EmptyState
            title="Nothing set yet"
            body="Create an assignment above. Once students hand work in it shows up in Marking."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.map((a) => (
              <AssignmentRow key={a.id} assignment={a} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function AssignmentRow({ assignment: a }: { assignment: TeacherAssignment }) {
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()

  const parent = a.course?.title ?? a.klass?.title ?? 'Unattached'
  const kind = a.course ? 'Course' : 'Class'

  return (
    <li className="rounded-xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-medium text-app-ink">{a.title}</p>
          <p className="mt-1 text-[0.84rem] font-light text-app-muted">
            {kind}: {parent}
            {a.due_at &&
              ` · due ${new Date(a.due_at).toLocaleDateString('en-NZ', {
                day: 'numeric',
                month: 'short',
              })}`}{' '}
            · out of {a.max_marks}
            {!a.allow_late && ' · no late work'}
          </p>
          <p className="mt-1 text-[0.84rem] font-light text-app-muted">
            {a.submissionCount === 0
              ? 'Nothing handed in yet'
              : `${a.submissionCount} handed in, ${a.ungradedCount} still to mark`}
          </p>
        </div>
        <StatusChip status={statusOf(a)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {a.status !== 'published' && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () =>
                setError((await setAssignmentStatus(a.id, 'published')).error),
              )
            }
            className="rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-60"
          >
            Publish
          </button>
        )}
        {a.status === 'published' && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () =>
                setError((await setAssignmentStatus(a.id, 'archived')).error),
              )
            }
            className="rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-60"
          >
            Close it
          </button>
        )}
        {a.ungradedCount > 0 && (
          <Link
            href="/portal/tutor/marking"
            className="rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle"
          >
            Mark {a.ungradedCount}
          </Link>
        )}

        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[0.82rem] font-light text-app-muted">
              Delete this and hide it from students?
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => setError((await deleteAssignment(a.id)).error))
              }
              className="rounded-full bg-app-bad-bg px-4 py-2 text-[0.82rem] font-medium text-app-bad disabled:opacity-60"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[0.82rem] font-light text-app-muted"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${a.title}`}
            className="ml-auto rounded-lg p-2 text-app-muted hover:bg-app-subtle hover:text-app-bad"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[0.85rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}
