import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import StudentDashboard from '../StudentDashboard'

export const metadata = { title: 'My progress — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')
  return (
    <StudentDashboard view="progress" name={profile?.full_name} yearLevel={profile?.year_level} />
  )
}
