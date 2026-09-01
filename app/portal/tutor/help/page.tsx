import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listOpenHelpRequests } from '@/lib/help-data'
import { EmptyState } from '@/components/app/Ui'
import HelpQueue from './HelpQueue'

export const metadata = { title: 'Help requests — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/content-and-help.sql to use this."
      />
    )
  }

  const requests = await listOpenHelpRequests()

  return <HelpQueue requests={requests} />
}
