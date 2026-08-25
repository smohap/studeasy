import Link from 'next/link'
import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listMyClasses } from '@/lib/classes-data'
import {
  CLASS_MODE_LABEL,
  CLASS_STATUS_LABEL,
  formatMoney,
  formatWhen,
} from '@/lib/class-types'
import { Panel, EmptyState } from '@/components/app/Ui'

export const metadata = { title: 'My classes — StudEasy', robots: { index: false } }

export default async function StudentClassesPage() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/classes-forum.sql to use this."
      />
    )
  }

  const classes = await listMyClasses()
  const upcoming = classes.filter((c) => c.session.status !== 'completed')
  const past = classes.filter((c) => c.session.status === 'completed')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          My classes
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Your seats, your waiting-list places, and the codes that open each class room.
        </p>
      </div>

      <Panel title="Coming up">
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
          <ul className="flex flex-col gap-3">
            {upcoming.map(({ session, registration }) => (
              <li
                key={session.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="min-w-0">
                  <p className="text-[0.98rem] font-medium text-app-ink">
                    <Link href={`/classes/${session.id}`} className="hover:underline">
                      {session.title}
                    </Link>
                  </p>
                  <p className="mt-1 text-[0.84rem] font-light text-app-muted">
                    {session.teacher_name} ·{' '}
                    {formatWhen(session.starts_at, session.ends_at)} ·{' '}
                    {CLASS_MODE_LABEL[session.mode]}
                    {session.location ? ` · ${session.location}` : ''}
                  </p>
                  <p className="mt-1.5 text-[0.84rem] font-light text-app-muted">
                    {registration?.status === 'confirmed' && 'Seat confirmed'}
                    {registration?.status === 'offered' &&
                      `Seat held — pay ${formatMoney(session.price_cents, session.currency)} to keep it`}
                    {registration?.status === 'waitlisted' &&
                      `Waiting list, number ${registration.waitlist_position}`}
                    {' · '}
                    {CLASS_STATUS_LABEL[session.status]}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {session.access_code && (
                    <p className="rounded-lg bg-app-subtle px-3 py-2">
                      <span className="block text-[0.7rem] font-medium text-app-muted">
                        Access code
                      </span>
                      <span className="mt-0.5 block font-mono text-[1rem] font-semibold tracking-[0.15em] text-app-ink">
                        {session.access_code}
                      </span>
                    </p>
                  )}
                  <Link
                    href={`/classes/${session.id}`}
                    className="mt-2 inline-block rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink hover:bg-app-subtle"
                  >
                    {session.status === 'in_progress' ? 'Open class room' : 'Details'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {past.length > 0 && (
        <Panel
          title="Finished"
          subtitle="Material stays open for a while after the class — each one says for how long."
        >
          <ul className="flex flex-col gap-2">
            {past.map(({ session }) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-app-subtle px-4 py-3"
              >
                <span className="text-[0.9rem] text-app-ink">{session.title}</span>
                <Link
                  href={`/classes/${session.id}`}
                  className="text-[0.84rem] font-medium text-app-ink hover:underline"
                >
                  Open material
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
