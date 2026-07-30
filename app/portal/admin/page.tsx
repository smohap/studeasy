import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { Panel } from '@/components/app/Ui'
import AdminDashboard from './AdminDashboard'
import TutorApprovals, { type PendingTutor } from './TutorApprovals'

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
    </div>
  )
}
