import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import type { ReactNode } from 'react'

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const { userId, profile } = await getCurrentUser()

  if (!userId) redirect('/sign-in?next=/portal')
  // Signed in but never finished registering.
  if (!profile?.role) redirect('/register/complete')

  return (
    <div className="min-h-svh px-5 py-8 sm:px-8">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link href="/" className="text-[1.05rem] font-extrabold tracking-tight uppercase">
          Stud<span className="text-accent">Easy</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-[0.85rem] font-light text-ink-dim sm:inline">
            {profile.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-[0.85rem] font-light text-ink transition-colors hover:border-ink/40"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto mt-14 max-w-5xl pb-24">{children}</main>

      <footer className="mx-auto max-w-5xl border-t border-hairline pt-6 pb-4 text-[0.8rem] font-light text-ink-dim">
        © {new Date().getFullYear()} AIDO Technologies Ltd.
      </footer>
    </div>
  )
}
