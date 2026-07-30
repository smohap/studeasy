import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import TutorDashboard from '../TutorDashboard'

export const metadata = { title: 'Marking — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')
  return <TutorDashboard view="marking" name={profile?.full_name} />
}
