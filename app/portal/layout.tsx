import { redirect } from 'next/navigation'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import AppShell, { type ShellNotification } from '@/components/app/AppShell'
import { heldRoles, type Role } from '@/lib/roles'
import { DEV_PREVIEW } from '@/lib/dev-preview'
import type { ReactNode } from 'react'

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const { userId, profile } = await getCurrentUser()

  if (!userId) redirect('/sign-in?next=/portal')
  if (!profile?.role) redirect('/register/complete')

  /*
   * Real notifications — waitlist promotions, forum replies, role decisions.
   * The bell used to render a fixtures array, so it said the same three things
   * to everyone regardless of what had actually happened to them.
   */
  let notifications: ShellNotification[] = []
  if (isAuthConfigured) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, created_at, read_at')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    notifications = (
      (data ?? []) as {
        id: string
        title: string
        body: string | null
        created_at: string
        read_at: string | null
      }[]
    ).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      at: new Date(n.created_at).toLocaleDateString('en-NZ', {
        day: 'numeric',
        month: 'short',
      }),
      unread: !n.read_at,
    }))
  }

  return (
    <AppShell
      role={profile.role as Role}
      myRoles={heldRoles(profile)}
      name={profile.full_name}
      email={profile.email}
      notifications={notifications}
      devPreview={DEV_PREVIEW}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  )
}
