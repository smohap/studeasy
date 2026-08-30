import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getMyEnrolments } from '@/lib/shop-data'
import { listMyClasses } from '@/lib/classes-data'
import { getStudentAssignments } from '@/lib/assignments'
import { getGamification } from '@/lib/assessments-data'
import { formatWhen } from '@/lib/class-types'
import AccountPanel from '@/components/app/AccountPanel'
import EnrolledCourses from '@/components/app/EnrolledCourses'
import { EmptyState, Panel, QuickActions, StatTile } from '@/components/app/Ui'
import LinkRequests, { type LinkRequest } from './LinkRequests'

export const metadata = { title: 'Student — StudEasy', robots: { index: false } }

export default async function StudentPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  // Parents waiting on this student's say-so.
  let requests: LinkRequest[] = []
  if (isAuthConfigured) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('my_link_requests')
    requests = (data as LinkRequest[]) ?? []
  }

  const [enrolments, classes, assignments, game] = await Promise.all([
    getMyEnrolments(),
    listMyClasses(),
    getStudentAssignments(),
    getGamification(),
  ])

  const now = Date.now()
  const upcoming = classes
    .filter((c) => new Date(c.session.ends_at).getTime() >= now)
    .slice(0, 4)

  const outstanding = assignments.filter((a) => !a.submission)
  const awaiting = assignments.filter((a) => a.submission && !a.submission.released)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          {outstanding.length > 0
            ? `You have ${outstanding.length} ${outstanding.length === 1 ? 'thing' : 'things'} to hand in`
            : 'You are all caught up'}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          {profile?.full_name ?? 'Your account'}
          {profile?.year_level && ` · ${profile.year_level}`}
        </p>
      </header>

      <QuickActions
        actions={[
          { label: 'My classes', href: '/portal/student/classes' },
          { label: 'Hand in work', href: '/portal/student/assignments' },
          { label: 'Find a class', href: '/classes' },
          { label: 'Ask the forum', href: '/forum' },
        ]}
      />

      {/* Counted from real rows, so a new account honestly shows zeroes. */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <StatTile label="To hand in" value={String(outstanding.length)} />
        </li>
        <li>
          <StatTile label="Waiting on a mark" value={String(awaiting.length)} />
        </li>
        <li>
          <StatTile label="Day streak" value={String(game?.streak_days ?? 0)} />
        </li>
        <li>
          <StatTile label="XP" value={String(game?.xp ?? 0)} />
        </li>
      </ul>

      {profile && <AccountPanel profile={profile} />}
      <LinkRequests requests={requests} />

      <Panel
        title="Coming up"
        subtitle="Classes you have a seat in."
        actions={
          <Link
            href="/portal/student/classes"
            className="text-[0.84rem] font-medium text-app-ink hover:underline"
          >
            All classes
          </Link>
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing booked"
            body="Live classes are small-group sessions with a real teacher, online or in person."
            action={
              <Link
                href="/classes"
                className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
              >
                Browse classes
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map(({ session, registration }) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-medium text-app-ink">
                    <Link href={`/classes/${session.id}`} className="hover:underline">
                      {session.title}
                    </Link>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.84rem] font-light text-app-muted">
                    <CalendarDays size={13} aria-hidden className="text-accent" />
                    {formatWhen(session.starts_at, session.ends_at)} ·{' '}
                    {session.teacher_name}
                  </p>
                </div>
                {registration?.status === 'offered' && (
                  <span className="text-[0.82rem] font-medium text-app-warn">
                    Payment due
                  </span>
                )}
                {registration?.status === 'waitlisted' && (
                  <span className="text-[0.82rem] font-medium text-app-muted">
                    Waiting list · {registration.waitlist_position}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <EnrolledCourses enrolments={enrolments} />
    </div>
  )
}
