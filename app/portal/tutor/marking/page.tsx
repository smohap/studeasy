import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getMarkingQueue } from '@/lib/assignments'
import TutorDashboard from '../TutorDashboard'
import LiveMarking from './LiveMarking'

export const metadata = { title: 'Marking — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  const rows = await getMarkingQueue()

  return (
    <div className="flex flex-col gap-6">
      <LiveMarking rows={rows} />
      <TutorDashboard view="marking" name={profile?.full_name} />
    </div>
  )
}
