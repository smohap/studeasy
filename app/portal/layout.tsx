import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import AppShell from '@/components/app/AppShell'
import type { Role } from '@/lib/roles'
import type { ReactNode } from 'react'

/**
 * True only in local development. Lets the dev role switcher reach dashboards
 * the signed-in account does not own, so all four can be reviewed from one
 * login. Every dashboard renders fixtures, so nothing real is exposed — but it
 * must never be true in production.
 */
export const DEV_PREVIEW = process.env.NODE_ENV === 'development'

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const { userId, profile } = await getCurrentUser()

  if (!userId) redirect('/sign-in?next=/portal')
  if (!profile?.role) redirect('/register/complete')

  return (
    <AppShell
      role={profile.role as Role}
      name={profile.full_name}
      email={profile.email}
      devPreview={DEV_PREVIEW}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  )
}
