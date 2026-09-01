import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listMyContent } from '@/lib/content-data'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'
import ContentStudio from './ContentStudio'

export const metadata = { title: 'Content library — StudEasy', robots: { index: false } }

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

  const items = await listMyContent()

  return (
    <ContentStudio
      items={items}
      subjects={SUBJECT_FILTERS.filter((s) => s !== 'All subjects')}
    />
  )
}
