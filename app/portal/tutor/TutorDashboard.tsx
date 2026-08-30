'use client'

import { useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { TUTOR } from '@/mock/tutor'
import { tutorTeachingPlan } from '@/mock/ai'
import type { Attendance, AiOutput } from '@/types/dashboard'
import { EmptyState, Panel, QuickActions, Skeleton, StatusChip } from '@/components/app/Ui'

const ATTENDANCE: { value: Exclude<Attendance, 'unmarked'>; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
]

export type TutorView = 'all' | 'students' | 'marking' | 'performance'

const TITLES: Record<TutorView, string> = {
  all: 'Who needs me today?',
  students: 'Students needing attention',
  marking: 'Assignments & marking',
  performance: 'Student performance',
}

export default function TutorDashboard({
  view = 'all',
  name,
}: {
  view?: TutorView
  name?: string | null
}) {
  const d = TUTOR
  const show = (section: TutorView) => view === 'all' || view === section
  const [marks, setMarks] = useState<Record<string, Attendance>>(
    Object.fromEntries(d.schedule.map((s) => [s.id, s.attendance])),
  )
  const [released, setReleased] = useState<Record<string, boolean>>(
    Object.fromEntries(d.marking.map((m) => [m.id, m.released])),
  )

  const [topic, setTopic] = useState('')
  const [plan, setPlan] = useState<AiOutput | null>(null)
  const [generating, setGenerating] = useState(false)

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setPlan(null)
    setPlan(await tutorTeachingPlan(topic))
    setGenerating(false)
  }

  const queue = d.marking.filter((m) => !released[m.id])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {TITLES[view]}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          {name ?? d.tutor.name} · {d.tutor.subjects?.join(' & ')} · {d.studentCount} students
        </p>
      </header>

      {view === 'all' && (
        <QuickActions
          actions={[
            { label: 'Classes & attendance', href: '/portal/tutor/classes' },
            { label: 'Set an assignment', href: '/portal/tutor/assignments' },
            { label: 'Marking', href: '/portal/tutor/marking' },
            { label: 'Course studio', href: '/portal/tutor/courses' },
          ]}
        />
      )}

      {/* 1 — Today's Schedule */}
      {view === 'all' && (
      <Panel title="Today's schedule" subtitle="Mark attendance as each session starts.">
        <ul className="flex flex-col gap-3">
          {d.schedule.map((s) => (
            <li key={s.id} className="rounded-xl border border-app-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.95rem] font-medium">
                    {s.time} · {s.subject}
                  </p>
                  <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                    {s.studentName} · {s.mode}
                  </p>
                </div>

                <fieldset className="flex gap-1.5">
                  <legend className="sr-only">Attendance for {s.studentName}</legend>
                  {ATTENDANCE.map((a) => {
                    const on = marks[s.id] === a.value
                    return (
                      <button
                        key={a.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setMarks((m) => ({ ...m, [s.id]: on ? 'unmarked' : a.value }))
                        }
                        className={`rounded-full border px-3 py-1.5 text-[0.8rem] transition-colors ${
                          on
                            ? 'border-app-ink bg-app-ink font-medium text-white'
                            : 'border-app-border font-light text-app-ink hover:bg-app-subtle'
                        }`}
                      >
                        {a.label}
                      </button>
                    )
                  })}
                </fieldset>
              </div>
              <p className="mt-2.5 text-[0.8rem] font-light text-app-muted">
                {marks[s.id] === 'unmarked'
                  ? 'Not marked yet'
                  : `Marked ${marks[s.id]}`}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
      )}

      {/* 2 — Students Needing Attention */}
      {show('students') && (
      <Panel
        title="Students needing attention"
        subtitle="Flagged automatically. Each one shows why, so you can disagree with it."
      >
        {d.atRisk.length === 0 ? (
          <EmptyState
            title="Nobody flagged"
            body="When attendance, homework or accuracy slips for one of your students, they appear here with the reason."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {d.atRisk.map((r) => (
              <li key={r.id} className="rounded-xl border border-app-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      size={17}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-app-warn"
                    />
                    <div>
                      <p className="text-[0.95rem] font-medium">{r.name}</p>
                      <p className="mt-1 max-w-xl text-[0.86rem] leading-relaxed font-light text-app-muted">
                        {r.reason}
                      </p>
                      <p className="mt-1.5 text-[0.82rem] font-medium">{r.metric}</p>
                    </div>
                  </div>
                  <StatusChip status={r.severity} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      )}

      {/* 3 — AI Teaching Assistant */}
      {view === 'all' && (
      <Panel
        title="AI teaching assistant"
        subtitle="Type a topic and get a plan, worksheet or quiz built from your own material."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[0.75rem] font-medium text-accent-deep">
            <Sparkles size={13} aria-hidden />
            Your worksheets, your style
          </span>
        }
      >
        <form onSubmit={generate} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="topic" className="sr-only">
            Topic
          </label>
          <input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Year 10 Algebra — rearranging formulae"
            className="min-w-0 flex-1 rounded-xl border border-app-border bg-app px-4 py-3 text-[0.92rem] font-light text-app-ink placeholder:text-app-muted"
          />
          <button
            type="submit"
            disabled={generating}
            className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </form>

        <div className="mt-5">
          {generating && <Skeleton lines={5} />}
          {!generating && plan && (
            <div className="rounded-xl border border-app-border p-4">
              <p className="text-[1rem] font-semibold tracking-tight">{plan.headline}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {plan.body.map((line) => (
                  <li
                    key={line}
                    className="text-[0.9rem] leading-relaxed font-light text-app-muted"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-app-border pt-3 text-[0.8rem] font-light text-app-muted">
                <span className="font-medium text-app-ink">Generated from:</span>{' '}
                {plan.groundedIn}
              </p>
            </div>
          )}
          {!generating && !plan && (
            <EmptyState
              title="Nothing generated yet"
              body="Enter a topic above. Output stays a draft until you save it to a class."
            />
          )}
        </div>
      </Panel>
      )}

      {/* 4 — Assignments & Marking */}
      {show('marking') && (
      <Panel
        title="Assignments & marking"
        subtitle={`${queue.length} waiting on you. Nothing reaches a student or parent until you release it.`}
      >
        {queue.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            body="Marked work appears here for you to check and release. Released marks show in the student's portal."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {queue.map((m) => (
              <li key={m.id} className="rounded-xl border border-app-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.95rem] font-medium">
                      {m.student} — {m.title}
                    </p>
                    <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                      {m.subject} · submitted {m.submitted}
                    </p>
                  </div>
                  <span className="rounded-full bg-app-subtle px-3 py-1 text-[0.85rem] font-semibold">
                    {m.aiMark}
                  </span>
                </div>

                <p className="mt-3 rounded-lg bg-app-subtle p-3 text-[0.87rem] leading-relaxed font-light text-app-ink">
                  <span className="font-medium">Suggested feedback:</span> {m.aiComment}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReleased((r) => ({ ...r, [m.id]: true }))}
                    className="rounded-full bg-accent px-4 py-2 text-[0.84rem] font-medium text-[#100c00]"
                  >
                    Release to student
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-medium hover:bg-app-subtle"
                  >
                    Edit feedback
                  </button>
                  <span className="text-[0.8rem] font-light text-app-muted">
                    Draft — not visible to {m.student.split(' ')[0]} yet
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      )}

      {/* 5 — Student Performance */}
      {show('performance') && (
      <Panel title="Student performance">
        <table className="hidden w-full text-left md:table">
          <caption className="sr-only">Per-student strengths, weaknesses and engagement</caption>
          <thead>
            <tr className="border-b border-app-border">
              {['Student', 'Year', 'Strength', 'Needs work', 'Homework', 'Engagement'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="pb-3 text-[0.78rem] font-semibold tracking-wide text-app-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.performance.map((p) => (
              <tr key={p.id} className="border-b border-app-border last:border-0">
                <th scope="row" className="py-3.5 text-[0.88rem] font-medium">
                  {p.name}
                </th>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{p.yearLevel}</td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{p.strength}</td>
                <td className="py-3.5 text-[0.88rem] font-light text-app-muted">{p.weakness}</td>
                <td className="py-3.5">
                  <StatusChip status={p.homework} />
                </td>
                <td className="py-3.5">
                  <StatusChip status={p.engagement} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="flex flex-col gap-3 md:hidden">
          {d.performance.map((p) => (
            <li key={p.id} className="rounded-xl border border-app-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.92rem] font-medium">{p.name}</p>
                  <p className="mt-0.5 text-[0.83rem] font-light text-app-muted">{p.yearLevel}</p>
                </div>
                <StatusChip status={p.engagement} />
              </div>
              <dl className="mt-3 flex flex-col gap-1.5 text-[0.85rem] font-light">
                <div className="flex gap-2">
                  <dt className="text-app-muted">Strength:</dt>
                  <dd>{p.strength}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-app-muted">Needs work:</dt>
                  <dd>{p.weakness}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <StatusChip status={p.homework} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      )}
    </div>
  )
}
