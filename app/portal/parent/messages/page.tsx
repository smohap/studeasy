import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import ParentDashboard from '../ParentDashboard'

export const metadata = { title: 'Messages — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'parent')
  return <ParentDashboard view="messages" name={profile?.full_name} />
}
