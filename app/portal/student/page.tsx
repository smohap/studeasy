import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import StudentDashboard from './StudentDashboard'

export const metadata = { title: 'Student — StudEasy', robots: { index: false } }

export default async function StudentPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')
  return <StudentDashboard />
}
