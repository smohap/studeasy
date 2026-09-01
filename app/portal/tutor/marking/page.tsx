import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getMarkingQueue } from '@/lib/assignments'
import { getAttemptQueue } from '@/lib/assessments-data'
import LiveMarking from './LiveMarking'
import MarkAttempts from './MarkAttempts'

export const metadata = { title: 'Marking — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  // Two queues, because assignment hand-ins and assessment attempts are
  // different rows with different release calls.
  const [rows, attempts] = await Promise.all([getMarkingQueue(), getAttemptQueue()])

  return (
    <div className="flex flex-col gap-6">
      <MarkAttempts attempts={attempts} />
      <LiveMarking rows={rows} />
    </div>
  )
}
