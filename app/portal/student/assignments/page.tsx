import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getStudentAssignments } from '@/lib/assignments'
import LiveAssignments from './LiveAssignments'

export const metadata = { title: 'Assignments — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  const assignments = await getStudentAssignments()

  return <LiveAssignments assignments={assignments} />
}
