import Link from 'next/link'
import { CalendarDays, Clock, XCircle } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listClassesForTeacher } from '@/lib/classes-data'
import { getMarkingQueue, getTeacherAssignments } from '@/lib/assignments'
import { formatWhen } from '@/lib/class-types'
import { EmptyState, Panel, QuickActions, StatTile } from '@/components/app/Ui'

export const metadata = { title: 'Tutor — StudEasy', robots: { index: false } }

export default async function TutorPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  /*
   * The approval gate reads the tutor role's own status, not profile.status —
   * that one describes whichever role they are signed in as, which for a tutor
   * who is also a parent says nothing about their teaching.
   *
   * It stays ahead of everything else: tutors can see students' work, so an
   * unapproved account gets nothing but its own status.
   */
  const tutorRole = profile?.roles?.find((r) => r.role === 'tutor')

  if (tutorRole && tutorRole.status !== 'active') {
    const rejected = tutorRole.status === 'rejected'
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
            {rejected ? 'This account is not active' : 'Waiting for approval'}
          </h1>
        </header>

        <Panel>
          <div className="flex gap-4">
            {rejected ? (
              <XCircle size={22} aria-hidden className="mt-0.5 shrink-0 text-app-bad" />
            ) : (
              <Clock size={22} aria-hidden className="mt-0.5 shrink-0 text-app-warn" />
            )}
            <div>
              <p className="max-w-2xl text-[0.95rem] leading-relaxed font-light text-app-muted">
                {rejected
                  ? 'A site administrator did not approve this tutor account. If you think that is a mistake, get in touch and we will look again.'
                  : "Tutor accounts are checked before they go live, because tutors can see students' work. We will email you once that is done."}
              </p>
              {!rejected && (profile?.teaching_subjects.length ?? 0) > 0 && (
                <p className="mt-4 text-[0.88rem] font-light text-app-muted">
                  You asked to teach: {profile?.teaching_subjects.join(', ')}
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>
    )
  }

  const [classes, assignments, marking] = await Promise.all([
    listClassesForTeacher(),
    getTeacherAssignments(),
    getMarkingQueue(),
  ])

  const now = Date.now()
  const upcoming = classes
    .filter((c) => new Date(c.session.ends_at).getTime() >= now)
    .slice(0, 4)

  const toMark = marking.filter((m) => !m.released)
  const registered = classes.reduce(
    (sum, c) => sum + Math.max(c.session.capacity - c.seatsLeft, 0),
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {toMark.length > 0
            ? `${toMark.length} ${toMark.length === 1 ? 'piece' : 'pieces'} of work to mark`
            : 'Nothing waiting on you'}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          {profile?.full_name ?? 'Your account'}
          {(profile?.teaching_subjects.length ?? 0) > 0 &&
            ` · ${profile?.teaching_subjects.join(', ')}`}
        </p>
      </header>

      <QuickActions
        actions={[
          { label: 'Classes & attendance', href: '/portal/tutor/classes' },
          { label: 'Set an assignment', href: '/portal/tutor/assignments' },
          { label: 'Marking', href: '/portal/tutor/marking' },
          { label: 'Course studio', href: '/portal/tutor/courses' },
        ]}
      />

      {/* Counted from real rows, so a new tutor honestly sees zeroes. */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <StatTile label="To mark" value={String(toMark.length)} />
        </li>
        <li>
          <StatTile label="Your classes" value={String(classes.length)} />
        </li>
        <li>
          <StatTile label="Seats taken" value={String(registered)} />
        </li>
        <li>
          <StatTile label="Assignments set" value={String(assignments.length)} />
        </li>
      </ul>

      <Panel
        title="Coming up"
        subtitle="Your next classes."
        actions={
          <Link
            href="/portal/tutor/classes"
            className="text-[0.84rem] font-medium text-app-ink hover:underline"
          >
            All classes
          </Link>
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            body="Schedule a class and students can register for it straight away."
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
          <ul className="flex flex-col gap-2">
            {upcoming.map((c) => (
              <li
                key={c.session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-medium text-app-ink">
                    {c.session.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.84rem] font-light text-app-muted">
                    <CalendarDays size={13} aria-hidden className="text-accent" />
                    {formatWhen(c.session.starts_at, c.session.ends_at)}
                  </p>
                </div>
                <span className="text-[0.82rem] font-light text-app-muted">
                  {c.session.capacity - c.seatsLeft}/{c.session.capacity} registered
                  {c.waitlistLength > 0 && ` · ${c.waitlistLength} waiting`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
