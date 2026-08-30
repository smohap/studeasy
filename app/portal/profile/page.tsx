import { redirect } from 'next/navigation'
import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'
import ProfileEditor from './ProfileEditor'

export const metadata = { title: 'My profile — StudEasy', robots: { index: false } }

/*
 * No guardRole here on purpose. Every role edits their own profile, and this is
 * also where someone adds a second one — gating it behind a particular role
 * would be exactly backwards.
 */
export default async function ProfilePage() {
  const { userId, profile } = await getCurrentUser()

  if (!userId) redirect('/sign-in?next=/portal/profile')

  if (!isAuthConfigured || !profile) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/multi-role.sql to use this."
      />
    )
  }

  return (
    <ProfileEditor
      profile={profile}
      subjects={SUBJECT_FILTERS.filter((s) => s !== 'All subjects')}
    />
  )
}
