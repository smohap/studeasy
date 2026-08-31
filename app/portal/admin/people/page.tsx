import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listPeople } from '@/lib/admin-data'
import { EmptyState } from '@/components/app/Ui'
import PeopleAdmin from './PeopleAdmin'

export const metadata = { title: 'People — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/multi-role.sql to manage people and roles."
      />
    )
  }

  // Real accounts. This page used to render five names from a fixtures file.
  const { people, authError } = await listPeople()

  return <PeopleAdmin people={people} authError={authError} />
}
