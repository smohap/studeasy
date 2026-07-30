import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import ParentDashboard from '../ParentDashboard'

export const metadata = { title: 'Progress reports — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'parent')
  return <ParentDashboard view="reports" name={profile?.full_name} />
}
