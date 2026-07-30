import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import AdminDashboard from '../AdminDashboard'

export const metadata = { title: 'Analytics — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')
  return <AdminDashboard view="analytics" />
}
