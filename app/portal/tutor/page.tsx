import { redirect } from 'next/navigation'
import { Clock, XCircle } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import { NotBuiltYet, Panel, PortalHeader } from '@/components/PortalHeader'

export const metadata = { title: 'Tutor portal — StudEasy', robots: { index: false } }

export default async function TutorPortal() {
  const { profile } = await getCurrentUser()
  if (profile?.role !== 'tutor') redirect(destinationFor(profile))

  if (profile.status === 'pending') {
    return (
      <>
        <PortalHeader
          role="tutor"
          name={profile.full_name}
          blurb="Your account is with a site administrator."
        />
        <section className="mt-12 flex gap-4 rounded-3xl border border-accent/30 bg-accent/[0.06] p-7 sm:p-9">
          <Clock size={24} aria-hidden className="mt-0.5 shrink-0 text-accent" strokeWidth={1.6} />
          <div>
            <h2 className="text-[1.15rem] font-semibold tracking-tight text-ink">
              Waiting for approval
            </h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed font-light text-ink-dim">
              Tutor accounts are checked before they go live, because tutors can see
              students&rsquo; work. We will email you at{' '}
              <span className="text-ink">{profile.email}</span> once that is done. Nothing
              else here works until then.
            </p>
            {profile.teaching_subjects.length > 0 && (
              <p className="mt-5 text-[0.9rem] font-light text-ink-dim">
                You asked to teach: {profile.teaching_subjects.join(', ')}
              </p>
            )}
          </div>
        </section>
      </>
    )
  }

  if (profile.status === 'rejected') {
    return (
      <>
        <PortalHeader role="tutor" name={profile.full_name} blurb="This account is not active." />
        <section className="mt-12 flex gap-4 rounded-3xl border border-hairline bg-base-raised p-7 sm:p-9">
          <XCircle size={24} aria-hidden className="mt-0.5 shrink-0 text-[#E88A8A]" strokeWidth={1.6} />
          <div>
            <h2 className="text-[1.15rem] font-semibold tracking-tight text-ink">
              Not approved
            </h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed font-light text-ink-dim">
              A site administrator did not approve this tutor account. If you think that
              is a mistake, get in touch and we will look again.
            </p>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <PortalHeader
        role="tutor"
        name={profile.full_name}
        blurb="Your evening back, without losing your teaching style."
      />

      <Panel title="Your subjects">
        {profile.teaching_subjects.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {profile.teaching_subjects.map((s) => (
              <li
                key={s}
                className="rounded-full border border-hairline px-4 py-2 text-[0.9rem] font-light text-ink"
              >
                {s}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.94rem] font-light text-ink-dim">No subjects recorded.</p>
        )}
      </Panel>

      <NotBuiltYet
        items={[
          "Today's schedule with one-tap attendance",
          'AI lesson planner and worksheet generator, trained on your materials',
          'Homework queue with AI-assisted marking to review and correct',
          'Auto-drafted lesson summaries you approve before they are sent',
          'Student notes, messages and reports',
        ]}
      />
    </>
  )
}
