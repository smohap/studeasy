import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import { NotBuiltYet, Panel, PortalHeader } from '@/components/PortalHeader'

export const metadata = { title: 'Student portal — StudEasy', robots: { index: false } }

export default async function StudentPortal() {
  const { profile } = await getCurrentUser()
  if (profile?.role !== 'student') redirect(destinationFor(profile))

  return (
    <>
      <PortalHeader
        role="student"
        name={profile.full_name}
        blurb="Everything due, everything shaky, and help at 9pm."
      />

      <Panel title="Your account">
        <dl className="flex flex-col gap-5 sm:flex-row sm:gap-12">
          <div>
            <dt className="text-[0.78rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
              Student ID
            </dt>
            <dd className="mt-2 font-mono text-[1.3rem] font-semibold tracking-wide text-accent">
              {profile.student_code ?? '—'}
            </dd>
            <p className="mt-2 max-w-xs text-[0.85rem] leading-relaxed font-light text-ink-dim">
              Give this to your parent or caregiver so they can link to your account.
            </p>
          </div>
          <div>
            <dt className="text-[0.78rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
              Year level
            </dt>
            <dd className="mt-2 text-[1rem] font-light text-ink">{profile.year_level ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[0.78rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
              Subjects
            </dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {profile.subjects.length > 0 ? (
                profile.subjects.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-hairline px-3 py-1 text-[0.85rem] font-light text-ink"
                  >
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-[0.9rem] font-light text-ink-dim">—</span>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <NotBuiltYet
        items={[
          "Today's lesson, homework due and upcoming tests, ordered by urgency",
          'AI Study Coach — questions answered from your tutor’s own worksheets',
          'Personal learning path, recalculated after every graded activity',
          'Homework upload, practice generator and step-by-step doubt solver',
          'Interactive whiteboard, plus recorded lessons you can search',
        ]}
      />
    </>
  )
}
