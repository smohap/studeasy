import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listMyHelpRequests } from '@/lib/help-data'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'
import AskForHelp from './AskForHelp'

export const metadata = { title: 'Get help — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/content-and-help.sql to use this."
      />
    )
  }

  const requests = await listMyHelpRequests()

  return (
    <AskForHelp
      requests={requests}
      subjects={SUBJECT_FILTERS.filter((s) => s !== 'All subjects')}
    />
  )
}
