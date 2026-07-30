import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import AccountPanel from '@/components/app/AccountPanel'
import StudentDashboard from './StudentDashboard'
import LinkRequests, { type LinkRequest } from './LinkRequests'

export const metadata = { title: 'Student — StudEasy', robots: { index: false } }

export default async function StudentPortal() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  // Parents waiting on this student's say-so.
  let requests: LinkRequest[] = []
  if (isAuthConfigured) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('my_link_requests')
    requests = (data as LinkRequest[]) ?? []
  }

  return (
    <div className="flex flex-col gap-6">
      {profile && <AccountPanel profile={profile} />}
      <LinkRequests requests={requests} />
      <StudentDashboard name={profile?.full_name} yearLevel={profile?.year_level} />
    </div>
  )
}
