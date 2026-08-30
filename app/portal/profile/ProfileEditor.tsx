'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Panel } from '@/components/app/Ui'
import { ROLE_LABEL, type Profile, type Role } from '@/lib/roles'
import { claimRole, updateProfile } from '@/app/portal/profile-actions'

/** admin is absent on purpose — it comes from the allowlist, never a request. */
const CLAIMABLE: Role[] = ['student', 'parent', 'tutor']

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

export default function ProfileEditor({
  profile,
  subjects,
}: {
  profile: Profile
  subjects: string[]
}) {
  const held = new Set(profile.roles.map((r) => r.role))
  const claimable = CLAIMABLE.filter((r) => !held.has(r))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          My profile
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Your details, and what you use StudEasy for. One account can be more than one
          thing.
        </p>
      </div>

      <Details profile={profile} subjects={subjects} />
      <Roles profile={profile} claimable={claimable} />
    </div>
  )
}

function Details({ profile, subjects }: { profile: Profile; subjects: string[] }) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [yearLevel, setYearLevel] = useState(profile.year_level ?? '')
  const [learning, setLearning] = useState<string[]>(profile.subjects ?? [])
  const [teaching, setTeaching] = useState<string[]>(profile.teaching_subjects ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const isStudent = profile.roles.some((r) => r.role === 'student')
  const isTutor = profile.roles.some((r) => r.role === 'tutor')

  const toggle = (list: string[], set: (v: string[]) => void, subject: string) =>
    set(list.includes(subject) ? list.filter((s) => s !== subject) : [...list, subject])

  return (
    <Panel title="Your details" subtitle="Everyone on StudEasy sees your name.">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setSaved(false)
          start(async () => {
            const res = await updateProfile({
              fullName,
              yearLevel,
              subjects: learning,
              teachingSubjects: teaching,
            })
            if (res.error) setError(res.error)
            else setSaved(true)
          })
        }}
      >
        <div>
          <label className={label} htmlFor="p-name">
            Full name
          </label>
          <input
            id="p-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={`${field} mt-1.5`}
          />
        </div>

        <div>
          <label className={label} htmlFor="p-email">
            Email
          </label>
          <input
            id="p-email"
            value={profile.email ?? ''}
            readOnly
            aria-describedby="p-email-hint"
            className={`${field} mt-1.5 opacity-60`}
          />
          <p id="p-email-hint" className="mt-1 text-[0.78rem] font-light text-app-muted">
            Your email is how you sign in — get in touch to change it.
          </p>
        </div>

        {isStudent && (
          <>
            <div>
              <label className={label} htmlFor="p-year">
                Year level
              </label>
              <input
                id="p-year"
                value={yearLevel}
                onChange={(e) => setYearLevel(e.target.value)}
                placeholder="Year 12 · NCEA Level 2"
                className={`${field} mt-1.5`}
              />
            </div>

            <div>
              <span className={label}>Student ID</span>
              <p className="mt-1.5 font-mono text-[0.95rem] text-accent-deep">
                {profile.student_code ?? 'Not issued yet'}
              </p>
              <p className="mt-1 text-[0.78rem] font-light text-app-muted">
                Give this to a parent so they can follow your progress.
              </p>
            </div>

            <fieldset className="sm:col-span-2">
              <legend className={label}>Subjects you are studying</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    on={learning.includes(s)}
                    onClick={() => toggle(learning, setLearning, s)}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {isTutor && (
          <fieldset className="sm:col-span-2">
            <legend className={label}>Subjects you teach</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {subjects.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  on={teaching.includes(s)}
                  onClick={() => toggle(teaching, setTeaching, s)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-[0.85rem] text-app-bad sm:col-span-2">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-[0.85rem] text-app-good sm:col-span-2">
            Saved.
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Panel>
  )
}

function Chip({
  label: text,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-[0.84rem] transition-colors ${
        on
          ? 'border-accent bg-accent/15 font-medium text-accent-deep'
          : 'border-app-border font-light text-app-ink hover:bg-app-subtle'
      }`}
    >
      {text}
    </button>
  )
}

function Roles({ profile, claimable }: { profile: Profile; claimable: Role[] }) {
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <Panel
      title="What you use StudEasy for"
      subtitle="Add a role and switch between them from the menu at the top — no second account needed."
    >
      <ul className="flex flex-wrap gap-2">
        {profile.roles.map((r) => (
          <li
            key={r.role}
            className={`rounded-full px-4 py-2 text-[0.85rem] font-medium ${
              r.status === 'active'
                ? 'bg-app-good-bg text-app-good'
                : r.status === 'pending'
                  ? 'bg-app-warn-bg text-app-warn'
                  : 'bg-app-bad-bg text-app-bad'
            }`}
          >
            {ROLE_LABEL[r.role]}
            {r.status === 'pending' && ' · awaiting approval'}
            {r.status === 'rejected' && ' · declined'}
          </li>
        ))}
      </ul>

      {claimable.length > 0 && (
        <div className="mt-6 border-t border-app-border pt-6">
          <p className="text-[0.85rem] font-medium text-app-ink">Add another role</p>
          <p className="mt-1 text-[0.84rem] leading-relaxed font-light text-app-muted">
            Teaching has to be approved by StudEasy first. The others start straight away.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {claimable.map((r) => (
              <button
                key={r}
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null)
                  setNote(null)
                  start(async () => {
                    const res = await claimRole(r)
                    if (res.error) setError(res.error)
                    else
                      setNote(
                        res.status === 'pending'
                          ? `Asked to become a ${ROLE_LABEL[r].toLowerCase()}. An administrator will review it.`
                          : `You are now also a ${ROLE_LABEL[r].toLowerCase()}.`,
                      )
                  })
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-app-border px-4 py-2 text-[0.85rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-60"
              >
                <Plus size={14} aria-hidden />
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] text-app-bad">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-3 text-[0.85rem] text-app-good">
          {note}
        </p>
      )}
    </Panel>
  )
}
