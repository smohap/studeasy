'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  BookOpen,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  LogOut,
  type LucideIcon,
  Mail,
  Menu,
  Search,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { Role } from '@/lib/roles'
import { ROLE_LABEL } from '@/lib/roles'
import { MESSAGES, NOTIFICATIONS } from '@/mock/shared'
import RoleSwitcher from './RoleSwitcher'
import IconMenu from './IconMenu'

/** `to` is appended to /portal/<role>; '' is that role's dashboard. */
type NavItem = { label: string; icon: LucideIcon; to: string }

const NAV: Record<Role, NavItem[]> = {
  student: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '' },
    { label: 'My progress', icon: LineChart, to: '/progress' },
    { label: 'Assignments', icon: BookOpen, to: '/assignments' },
    { label: 'Achievements', icon: GraduationCap, to: '/achievements' },
  ],
  parent: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '' },
    { label: 'Progress reports', icon: LineChart, to: '/reports' },
    { label: 'Messages', icon: Mail, to: '/messages' },
    { label: 'Bookings & payments', icon: CreditCard, to: '/billing' },
  ],
  tutor: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '' },
    { label: 'Course studio', icon: Store, to: '/courses' },
    { label: 'My students', icon: Users, to: '/students' },
    { label: 'Marking', icon: BookOpen, to: '/marking' },
    { label: 'Performance', icon: LineChart, to: '/performance' },
  ],
  admin: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '' },
    { label: 'Analytics', icon: LineChart, to: '/analytics' },
    { label: 'People', icon: Users, to: '/people' },
    { label: 'Finance', icon: Wallet, to: '/finance' },
  ],
}

export default function AppShell({
  role,
  name,
  email,
  devPreview,
  signOutAction,
  children,
}: {
  role: Role
  name: string | null
  email: string | null
  /** True only in development — gates the role switcher. */
  devPreview: boolean
  signOutAction: () => void
  children: React.ReactNode
}) {
  const [drawer, setDrawer] = useState(false)
  const pathname = usePathname()

  /*
   * The nav follows the dashboard being viewed, not the account's own role.
   * In production the route guard makes those the same thing; in dev preview
   * the role switcher moves between them, and the sidebar has to keep up.
   */
  const segment = pathname.split('/')[2]
  const viewRole = (segment in NAV ? segment : role) as Role
  const items = NAV[viewRole]

  const base = `/portal/${viewRole}`

  const sidebar = (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      {items.map((item) => {
        const href = `${base}${item.to}`
        const current = pathname === href
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={current ? 'page' : undefined}
            title={item.label}
            onClick={() => setDrawer(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] transition-colors lg:justify-start ${
              current
                ? 'bg-app-subtle font-medium text-app-ink'
                : 'font-light text-app-muted hover:bg-app-subtle/70'
            }`}
          >
            <item.icon size={18} aria-hidden className="shrink-0" />
            <span className="lg:inline">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-svh bg-app text-app-ink">
      <div className="flex">
        {/* Sidebar: full under lg+, drawer below md. */}
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-app-border bg-app-panel px-4 py-5 md:flex">
          <Link href="/" className="px-2 text-[1.05rem] font-extrabold tracking-tight uppercase">
            Stud<span className="text-accent-deep">Easy</span>
          </Link>
          <p className="mt-1 px-2 text-[0.78rem] font-medium text-app-muted">
            {ROLE_LABEL[viewRole]}
          </p>
          <div className="mt-7 flex-1">{sidebar}</div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] font-light text-app-muted transition-colors hover:bg-app-subtle"
            >
              <LogOut size={18} aria-hidden />
              Sign out
            </button>
          </form>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-app-border bg-app-panel/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-label="Open menu"
                aria-expanded={drawer}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-app-border md:hidden"
              >
                <Menu size={17} aria-hidden />
              </button>

              <div className="relative min-w-0 flex-1">
                <Search
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted"
                />
                <input
                  type="search"
                  placeholder="Search students, lessons, invoices…"
                  aria-label="Search"
                  className="w-full rounded-full border border-app-border bg-app py-2 pr-4 pl-9 text-[0.88rem] font-light text-app-ink placeholder:text-app-muted"
                />
              </div>

              {devPreview && <RoleSwitcher current={viewRole} />}

              <IconMenu
                label="Notifications"
                emptyText="Nothing new. Announcements from StudEasy show up here."
                items={NOTIFICATIONS}
                icon={<Bell size={17} aria-hidden />}
              />
              <IconMenu
                label="Messages"
                emptyText="No messages. Notes from your tutor arrive here."
                items={MESSAGES.map((m) => ({
                  id: m.id,
                  title: m.from,
                  body: m.preview,
                  at: m.at,
                  unread: m.unread,
                }))}
                icon={<Mail size={17} aria-hidden />}
              />

              <details className="relative shrink-0">
                <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full bg-app-subtle text-[0.8rem] font-semibold text-app-ink">
                  <span className="sr-only">Profile menu</span>
                  {(name ?? 'S').slice(0, 1).toUpperCase()}
                </summary>
                <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-app-border bg-app-panel p-4 shadow-lg">
                  <p className="text-[0.9rem] font-medium text-app-ink">{name ?? 'Signed in'}</p>
                  <p className="mt-0.5 truncate text-[0.82rem] font-light text-app-muted">
                    {email}
                  </p>
                  <form action={signOutAction} className="mt-4">
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-app-border py-2 text-[0.85rem] font-medium hover:bg-app-subtle"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

          <footer className="border-t border-app-border px-4 py-6 text-[0.8rem] font-light text-app-muted sm:px-6">
            © {new Date().getFullYear()} AIDO Technologies Ltd.
          </footer>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-app-panel px-4 py-5">
            <div className="flex items-center justify-between">
              <span className="text-[1.05rem] font-extrabold tracking-tight uppercase">
                Stud<span className="text-accent-deep">Easy</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-lg border border-app-border"
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="mt-7">{sidebar}</div>
          </div>
        </div>
      )}
    </div>
  )
}

