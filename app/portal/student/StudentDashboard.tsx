'use client'

import { AlertCircle, CalendarClock, ClipboardList, Flame, Upload } from 'lucide-react'
import { STUDENT } from '@/mock/student'
import { studentDailyPlan } from '@/mock/ai'
import type { HubItem, Urgency } from '@/types/dashboard'
import AiPanel from '@/components/app/AiPanel'
import Figure from '@/components/app/Figure'
import { EmptyState, Panel, QuickActions, StatusChip } from '@/components/app/Ui'
import StudyCoach from './StudyCoach'

const URGENCY: Record<Urgency, { label: string; className: string }> = {
  now: { label: 'Now', className: 'bg-app-bad-bg text-app-bad' },
  today: { label: 'Today', className: 'bg-app-warn-bg text-app-warn' },
  soon: { label: 'This week', className: 'bg-app-subtle text-app-muted' },
}

const KIND_ICON = {
  class: CalendarClock,
  homework: ClipboardList,
  test: AlertCircle,
  task: ClipboardList,
} as const

export type StudentView = 'all' | 'progress' | 'assignments' | 'achievements'

const TITLES: Record<StudentView, string> = {
  all: 'What should I do today?',
  progress: 'My progress',
  assignments: 'Assignments & homework',
  achievements: 'Achievements',
}

/**
 * `view` lets the sidebar routes render one section each without duplicating
 * the panels. `name` and `yearLevel` come from the signed-in account, not the
 * fixture — the greeting has to be the reader's own name.
 */
export default function StudentDashboard({
  view = 'all',
  name,
  yearLevel,
}: {
  view?: StudentView
  name?: string | null
  yearLevel?: string | null
}) {
  const d = STUDENT
  const show = (section: StudentView) => view === 'all' || view === section

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {TITLES[view]}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          {name ?? d.student.name}
          {yearLevel ? ` · ${yearLevel}` : ''}
        </p>
      </header>

      {view === 'all' && (
        <QuickActions
          actions={[
            { label: 'My classes', href: '/portal/student/classes' },
            { label: 'Hand in work', href: '/portal/student/assignments' },
            { label: 'Find a class', href: '/classes' },
            { label: 'Ask the forum', href: '/forum' },
          ]}
        />
      )}

      {view === 'all' && (
        <>
      {/* 1 — Today's Learning Hub */}
      <Panel title="Today's Learning Hub" subtitle="Ordered by what runs out of time first.">
        {d.hub.length === 0 ? (
          <EmptyState
            title="Nothing due yet"
            body="Once your first lesson is booked, today's class, homework and tests all show up here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {d.hub.map((item) => (
              <HubRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Panel>

      {/* AI widget */}
      <AiPanel
        title="Your plan for today"
        question="What should I study today?"
        load={studentDailyPlan}
      />

      {/* 2 — AI Study Coach */}
      <StudyCoach prompts={d.coachPrompts} />
        </>
      )}

      {/* 3 — My Progress */}
      {show('progress') && (
      <Panel title="My Progress">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Figure chart={d.recentScores} unit="%" />
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-app-border p-4">
              <Flame size={20} aria-hidden className="text-accent-deep" />
              <div>
                <p className="text-[1.25rem] leading-none font-semibold">{d.streakDays} days</p>
                <p className="mt-1 text-[0.82rem] font-light text-app-muted">Study streak</p>
              </div>
            </div>
            {d.mastery.map((m) => (
              <div key={m.subject} className="rounded-xl border border-app-border p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[0.9rem] font-medium">{m.subject}</p>
                  <p className="text-[0.82rem] font-light text-app-muted">
                    Predicted: <span className="font-medium text-app-ink">{m.predictedGrade}</span>
                  </p>
                </div>
                <div
                  role="img"
                  aria-label={`${m.subject} mastery ${m.mastery} percent, trend ${m.trend}`}
                  className="mt-3 h-2 overflow-hidden rounded-full bg-app-subtle"
                >
                  <span
                    className="block h-full rounded-full bg-accent-deep"
                    style={{ width: `${m.mastery}%` }}
                  />
                </div>
                <p className="mt-2 text-[0.8rem] font-light text-app-muted">
                  {m.mastery}% mastery ·{' '}
                  {m.trend === 'up' ? 'improving' : m.trend === 'down' ? 'slipping' : 'no change'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      )}

      {/* 4 — Assignments & Homework */}
      {show('assignments') && (
      <Panel
        title="Assignments & Homework"
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-app-border px-3.5 py-1.5 text-[0.82rem] font-medium hover:bg-app-subtle"
          >
            <Upload size={14} aria-hidden />
            Upload
          </button>
        }
      >
        <ul className="flex flex-col gap-3">
          {d.assignments.map((a) => (
            <li key={a.id} className="rounded-xl border border-app-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.95rem] font-medium">{a.title}</p>
                  <p className="mt-1 text-[0.84rem] font-light text-app-muted">
                    {a.subject} · due {a.due}
                    {a.mark ? ` · ${a.mark}` : ''}
                  </p>
                </div>
                <StatusChip status={a.status} />
              </div>
              {a.feedback && (
                <p className="mt-3 border-t border-app-border pt-3 text-[0.86rem] leading-relaxed font-light text-app-muted">
                  <span className="font-medium text-app-ink">Ms. Patel:</span> {a.feedback}
                </p>
              )}
            </li>
          ))}
        </ul>

        {/* Drop zone is UI only — no upload target exists yet. */}
        <div className="mt-4 rounded-xl border border-dashed border-app-border px-5 py-7 text-center">
          <p className="text-[0.9rem] font-medium">Drop a photo or PDF of your work</p>
          <p className="mt-1 text-[0.84rem] font-light text-app-muted">
            Or use the Upload button. Handwriting is fine — it gets read back to you before
            marking.
          </p>
        </div>
      </Panel>
      )}

      {/* 5 — Achievements */}
      {show('achievements') && (
      <Panel title="Achievements">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[1.5rem] leading-none font-semibold">Level {d.level}</p>
            <p className="mt-1.5 text-[0.84rem] font-light text-app-muted">
              {d.xp} / {d.xpToNextLevel} XP
            </p>
            <div
              role="img"
              aria-label={`${d.xp} of ${d.xpToNextLevel} XP toward level ${d.level + 1}`}
              className="mt-2 h-2 w-44 overflow-hidden rounded-full bg-app-subtle"
            >
              <span
                className="block h-full rounded-full bg-accent-deep"
                style={{ width: `${(d.xp / d.xpToNextLevel) * 100}%` }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-app-border p-4">
            <p className="text-[1.5rem] leading-none font-semibold">
              #{d.leaderboardPosition}
            </p>
            <p className="mt-1.5 text-[0.84rem] font-light text-app-muted">
              of {d.leaderboardOf} in your year
            </p>
          </div>
        </div>

        <ul className="mt-5 flex flex-wrap gap-2">
          {d.badges.map((b) => (
            <li
              key={b.id}
              title={b.detail}
              className={`rounded-full border px-3.5 py-1.5 text-[0.84rem] ${
                b.earned
                  ? 'border-app-border bg-app-subtle font-medium text-app-ink'
                  : 'border-dashed border-app-border font-light text-app-muted'
              }`}
            >
              {b.name}
              <span className="sr-only">{b.earned ? ' — earned' : ' — not yet earned'}</span>
            </li>
          ))}
        </ul>
      </Panel>
      )}
    </div>
  )
}

function HubRow({ item }: { item: HubItem }) {
  const Icon = KIND_ICON[item.kind]
  const u = URGENCY[item.urgency]

  return (
    <li className="flex items-start gap-4 rounded-xl border border-app-border p-4">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-app-subtle">
        <Icon size={17} aria-hidden className="text-app-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.95rem] font-medium">{item.title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${u.className}`}>
            {u.label}
          </span>
        </div>
        <p className="mt-1 text-[0.86rem] leading-relaxed font-light text-app-muted">
          {item.detail}
        </p>
        <p className="mt-1.5 text-[0.82rem] font-medium text-app-ink">{item.due}</p>
      </div>
    </li>
  )
}
