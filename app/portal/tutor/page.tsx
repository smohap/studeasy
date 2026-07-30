import { Clock, XCircle } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { Panel } from '@/components/app/Ui'
import TutorDashboard from './TutorDashboard'

export const metadata = { title: 'Tutor — StudEasy', robots: { index: false } }

export default async function TutorPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  // Approval gate stays ahead of the dashboard: tutors can see students' work,
  // so an unapproved account gets nothing but its own status.
  if (profile?.role === 'tutor' && profile.status !== 'active') {
    const rejected = profile.status === 'rejected'
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
              {!rejected && profile.teaching_subjects.length > 0 && (
                <p className="mt-4 text-[0.88rem] font-light text-app-muted">
                  You asked to teach: {profile.teaching_subjects.join(', ')}
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>
    )
  }

  return <TutorDashboard />
}
