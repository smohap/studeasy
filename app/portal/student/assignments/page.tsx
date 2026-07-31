import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getStudentAssignments } from '@/lib/assignments'
import StudentDashboard from '../StudentDashboard'
import LiveAssignments from './LiveAssignments'

export const metadata = { title: 'Assignments — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  const assignments = await getStudentAssignments()

  return (
    <div className="flex flex-col gap-6">
      <LiveAssignments assignments={assignments} />
      <StudentDashboard
        view="assignments"
        name={profile?.full_name}
        yearLevel={profile?.year_level}
      />
    </div>
  )
}
