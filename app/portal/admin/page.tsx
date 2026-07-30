import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { Panel } from '@/components/app/Ui'
import { COURSE_FIELDS, type Course } from '@/lib/catalog'
import AdminDashboard from './AdminDashboard'
import TutorApprovals, { type PendingTutor } from './TutorApprovals'
import CourseModeration from './CourseModeration'

export const metadata = { title: 'Admin — StudEasy', robots: { index: false } }

export default async function AdminPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  // The approvals panel is the only live data here. Without credentials there is
  // nothing to query, so it is skipped rather than crashing.
  if (!isAuthConfigured) {
    return <AdminDashboard />
  }

  // Real tutor accounts awaiting a real decision.
  const supabase = await createClient()
  const { data: tutors } = await supabase
    .from('profiles')
    .select('id, full_name, email, teaching_subjects, status, created_at')
    .eq('role', 'tutor')
    .order('created_at', { ascending: true })

  const all = (tutors ?? []) as PendingTutor[]

  // Courses submitted for approval — nothing sells until one is published.
  const { data: queued } = await supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .eq('status', 'pending_review')
    .order('updated_at', { ascending: true })

  return (
    <div className="flex flex-col gap-6">
      <AdminDashboard />

      <Panel
        title="Tutor approvals"
        subtitle="Live account data. Approving here unlocks that tutor's portal immediately."
      >
        <TutorApprovals
          pending={all.filter((t) => t.status === 'pending')}
          decided={all.filter((t) => t.status !== 'pending')}
        />
      </Panel>

      <Panel
        title="Course approvals"
        subtitle="Live catalog data. Publishing puts a course on sale immediately."
      >
        <CourseModeration queue={(queued ?? []) as Course[]} />
      </Panel>
    </div>
  )
}
