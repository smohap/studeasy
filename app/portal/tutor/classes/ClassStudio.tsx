'use client'

import { useState, useTransition } from 'react'
import { CalendarPlus, ChevronDown, Trash2 } from 'lucide-react'
import { Panel, EmptyState } from '@/components/app/Ui'
import {
  CLASS_MODE_LABEL,
  CLASS_STATUS_LABEL,
  formatMoney,
  formatWhen,
  type ClassMaterial,
  type ClassMode,
  type ClassStatus,
  type ClassWithStanding,
  type MaterialKind,
} from '@/lib/class-types'
import type { RosterEntry } from '@/lib/classes-data'
import {
  addClassMaterial,
  createClassSession,
  markAttendance,
  removeClassMaterial,
  setClassStatus,
  type NewClass,
} from '@/app/portal/class-actions'

export type ClassBundle = ClassWithStanding & {
  roster: RosterEntry[]
  materials: ClassMaterial[]
}

const BLANK: NewClass = {
  title: '',
  subject: '',
  yearLevel: '',
  topics: '',
  mode: 'online',
  location: '',
  meetingUrl: '',
  startsAt: '',
  endsAt: '',
  capacity: '12',
  waitlistCap: '10',
  priceDollars: '0',
  refundFullHours: '48',
  refundPartialHours: '12',
  refundPartialPct: '50',
  materialsDays: '14',
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

/** Where a class can go next, in the order a teacher would move it. */
const NEXT_STATUS: Record<ClassStatus, ClassStatus[]> = {
  draft: ['published'],
  published: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: ['published'],
}

const STATUS_ACTION: Partial<Record<ClassStatus, string>> = {
  published: 'Publish',
  in_progress: 'Start class',
  completed: 'Mark finished',
  cancelled: 'Cancel class',
}

export default function ClassStudio({
  classes,
  subjects,
}: {
  classes: ClassBundle[]
  subjects: string[]
}) {
  const [form, setForm] = useState<NewClass>(BLANK)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const set = (k: keyof NewClass) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await createClassSession(form)
      if (res.error) setError(res.error)
      else setForm(BLANK)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">Classes</h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Schedule a class, watch it fill, and release the material when you start it.
          Students only see documents once the class is in progress.
        </p>
      </div>

      <Panel title="Schedule a class" subtitle="It stays a draft until you publish it.">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-title">
              Title
            </label>
            <input
              id="c-title"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="Calculus: integration by parts"
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-subject">
              Subject
            </label>
            <input
              id="c-subject"
              list="subject-options"
              value={form.subject}
              onChange={(e) => set('subject')(e.target.value)}
              placeholder="Mathematics"
              className={`${field} mt-1.5`}
            />
            <datalist id="subject-options">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label className={label} htmlFor="c-year">
              Year level
            </label>
            <input
              id="c-year"
              value={form.yearLevel}
              onChange={(e) => set('yearLevel')(e.target.value)}
              placeholder="Year 12 · NCEA Level 2"
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-starts">
              Starts
            </label>
            <input
              id="c-starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set('startsAt')(e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-ends">
              Ends
            </label>
            <input
              id="c-ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set('endsAt')(e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-mode">
              Online or in the classroom
            </label>
            <select
              id="c-mode"
              value={form.mode}
              onChange={(e) => set('mode')(e.target.value as ClassMode)}
              className={`${field} mt-1.5`}
            >
              {(Object.keys(CLASS_MODE_LABEL) as ClassMode[]).map((m) => (
                <option key={m} value={m}>
                  {CLASS_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="c-location">
              {form.mode === 'online' ? 'Meeting link' : 'Location'}
            </label>
            <input
              id="c-location"
              value={form.mode === 'online' ? form.meetingUrl : form.location}
              onChange={(e) =>
                form.mode === 'online'
                  ? set('meetingUrl')(e.target.value)
                  : set('location')(e.target.value)
              }
              placeholder={form.mode === 'online' ? 'https://…' : 'Room 4, Newmarket'}
              className={`${field} mt-1.5`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-topics">
              Topics covered
            </label>
            <textarea
              id="c-topics"
              rows={3}
              value={form.topics}
              onChange={(e) => set('topics')(e.target.value)}
              placeholder="What students will work through in this session."
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-capacity">
              Number of attendees
            </label>
            <input
              id="c-capacity"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => set('capacity')(e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-waitlist">
              Waiting list places (max 10)
            </label>
            <input
              id="c-waitlist"
              type="number"
              min={0}
              max={10}
              value={form.waitlistCap}
              onChange={(e) => set('waitlistCap')(e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-price">
              Price (NZD, 0 for free)
            </label>
            <input
              id="c-price"
              type="number"
              min={0}
              step="0.01"
              value={form.priceDollars}
              onChange={(e) => set('priceDollars')(e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-materials-days">
              Keep material available for (days after the class)
            </label>
            <input
              id="c-materials-days"
              type="number"
              min={1}
              value={form.materialsDays}
              onChange={(e) => set('materialsDays')(e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <fieldset className="rounded-xl border border-app-border p-4 sm:col-span-2">
            <legend className="px-1 text-[0.8rem] font-medium text-app-muted">
              Refund policy
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={label} htmlFor="c-full">
                  Full refund up to (hours before)
                </label>
                <input
                  id="c-full"
                  type="number"
                  min={0}
                  value={form.refundFullHours}
                  onChange={(e) => set('refundFullHours')(e.target.value)}
                  className={`${field} mt-1.5`}
                />
              </div>
              <div>
                <label className={label} htmlFor="c-partial">
                  Part refund up to (hours before)
                </label>
                <input
                  id="c-partial"
                  type="number"
                  min={0}
                  value={form.refundPartialHours}
                  onChange={(e) => set('refundPartialHours')(e.target.value)}
                  className={`${field} mt-1.5`}
                />
              </div>
              <div>
                <label className={label} htmlFor="c-pct">
                  Part refund amount (%)
                </label>
                <input
                  id="c-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={form.refundPartialPct}
                  onChange={(e) => set('refundPartialPct')(e.target.value)}
                  className={`${field} mt-1.5`}
                />
              </div>
            </div>
          </fieldset>

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
              <CalendarPlus size={16} aria-hidden />
              {pending ? 'Saving…' : 'Create class'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Your classes">
        {classes.length === 0 ? (
          <EmptyState
            title="No classes yet"
            body="Schedule one above. Students will see it as soon as you publish."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {classes.map((c) => (
              <ClassRow
                key={c.session.id}
                bundle={c}
                open={open === c.session.id}
                onToggle={() => setOpen(open === c.session.id ? null : c.session.id)}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function ClassRow({
  bundle,
  open,
  onToggle,
}: {
  bundle: ClassBundle
  open: boolean
  onToggle: () => void
}) {
  const { session, seatsLeft, waitlistLength, roster, materials } = bundle
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const holding = roster.filter((r) =>
    ['confirmed', 'offered'].includes(r.registration.status),
  )
  const waiting = roster.filter((r) => r.registration.status === 'waitlisted')

  return (
    <li className="rounded-xl border border-app-border">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[0.98rem] font-medium text-app-ink">{session.title}</p>
          <p className="mt-1 text-[0.84rem] font-light text-app-muted">
            {session.subject}
            {session.year_level ? ` · ${session.year_level}` : ''} ·{' '}
            {formatWhen(session.starts_at, session.ends_at)} ·{' '}
            {CLASS_MODE_LABEL[session.mode]} · {formatMoney(session.price_cents)}
          </p>
          <p className="mt-1.5 text-[0.84rem] font-light text-app-muted">
            {CLASS_STATUS_LABEL[session.status]} · {holding.length}/{session.capacity}{' '}
            registered
            {waitlistLength > 0 && ` · ${waitlistLength} waiting`}
            {seatsLeft > 0 && ` · ${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'} left`}
          </p>
          {session.access_code && (
            <p className="mt-1.5 text-[0.84rem] font-light text-app-muted">
              Access code:{' '}
              <span className="font-mono font-medium text-app-ink">
                {session.access_code}
              </span>{' '}
              — registered students get this automatically.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {NEXT_STATUS[session.status].map((next) => (
            <button
              key={next}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setClassStatus(session.id, next)
                  setError(res.error)
                })
              }
              className="rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-60"
            >
              {STATUS_ACTION[next] ?? next}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle"
          >
            Roster &amp; material
            <ChevronDown
              size={14}
              aria-hidden
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-4 pb-3 text-[0.85rem] text-app-bad">
          {error}
        </p>
      )}

      {open && (
        <div className="grid gap-5 border-t border-app-border p-4 lg:grid-cols-2">
          <Roster classId={session.id} holding={holding} waiting={waiting} />
          <Materials classId={session.id} materials={materials} />
        </div>
      )}
    </li>
  )
}

function Roster({
  classId,
  holding,
  waiting,
}: {
  classId: string
  holding: RosterEntry[]
  waiting: RosterEntry[]
}) {
  const [pending, start] = useTransition()

  return (
    <div>
      <h3 className="text-[0.9rem] font-semibold text-app-ink">Register</h3>

      {holding.length === 0 ? (
        <p className="mt-2 text-[0.85rem] font-light text-app-muted">
          Nobody has registered yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {holding.map((r) => (
            <li
              key={r.registration.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-app-subtle px-3 py-2"
            >
              <span className="text-[0.86rem] text-app-ink">
                {r.name}
                {r.studentCode && (
                  <span className="ml-2 font-mono text-[0.78rem] text-app-muted">
                    {r.studentCode}
                  </span>
                )}
                {r.registration.status === 'offered' && (
                  <span className="ml-2 text-[0.78rem] text-app-warn">
                    awaiting payment
                  </span>
                )}
              </span>
              <span className="flex gap-1">
                {(['present', 'late', 'absent'] as const).map((state) => (
                  <button
                    key={state}
                    type="button"
                    disabled={pending}
                    aria-pressed={r.registration.attendance === state}
                    onClick={() =>
                      start(async () => {
                        await markAttendance(classId, r.registration.student_id, state)
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-[0.76rem] font-medium capitalize ${
                      r.registration.attendance === state
                        ? 'bg-accent text-[#100c00]'
                        : 'border border-app-border text-app-muted hover:bg-app-panel'
                    }`}
                  >
                    {state}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {waiting.length > 0 && (
        <>
          <h4 className="mt-5 text-[0.86rem] font-semibold text-app-ink">
            Waiting list ({waiting.length})
          </h4>
          <ol className="mt-2 flex flex-col gap-1.5">
            {waiting.map((r) => (
              <li
                key={r.registration.id}
                className="text-[0.85rem] font-light text-app-muted"
              >
                {r.registration.waitlist_position}. {r.name}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[0.8rem] font-light text-app-muted">
            They move up automatically when someone cancels.
          </p>
        </>
      )}
    </div>
  )
}

const KINDS: MaterialKind[] = ['document', 'video', 'link', 'notes', 'assignment']

function Materials({
  classId,
  materials,
}: {
  classId: string
  materials: ClassMaterial[]
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<MaterialKind>('document')
  const [url, setUrl] = useState('')
  const [until, setUntil] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await addClassMaterial({
        classId,
        title,
        description,
        kind,
        externalUrl: url,
        body: '',
        availableFrom: '',
        availableUntil: until,
      })
      if (res.error) setError(res.error)
      else {
        setTitle('')
        setDescription('')
        setUrl('')
        setUntil('')
      }
    })
  }

  return (
    <div>
      <h3 className="text-[0.9rem] font-semibold text-app-ink">Material</h3>
      <p className="mt-1 text-[0.82rem] leading-relaxed font-light text-app-muted">
        Hidden until you set the class to In progress. Leave the end date blank to use the
        class default.
      </p>

      <form onSubmit={add} className="mt-3 flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Material title"
          className={field}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line description (optional)"
          aria-label="Material description"
          className={field}
        />
        <div className="flex gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MaterialKind)}
            aria-label="Material type"
            className={`${field} w-40 capitalize`}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            aria-label="Link to the document or video"
            className={field}
          />
        </div>
        <label className={label} htmlFor={`until-${classId}`}>
          Available until (optional)
        </label>
        <input
          id={`until-${classId}`}
          type="datetime-local"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className={field}
        />

        {error && (
          <p role="alert" className="text-[0.82rem] text-app-bad">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-60"
        >
          {pending ? 'Adding…' : 'Add material'}
        </button>
      </form>

      {materials.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {materials.map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-app-subtle px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-[0.86rem] text-app-ink">{m.title}</span>
                <span className="block text-[0.78rem] font-light text-app-muted capitalize">
                  {m.kind}
                  {m.available_until &&
                    ` · until ${new Date(m.available_until).toLocaleDateString('en-NZ')}`}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${m.title}`}
                onClick={() =>
                  start(async () => {
                    await removeClassMaterial(m.id, classId)
                  })
                }
                className="shrink-0 rounded-lg p-1.5 text-app-muted hover:bg-app-panel hover:text-app-bad"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
