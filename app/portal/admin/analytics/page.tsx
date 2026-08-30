import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { EmptyState } from '@/components/app/Ui'

export const metadata = { title: 'Analytics — StudEasy', robots: { index: false } }

/*
 * This page drew three trend charts — revenue, attendance, retention — from a
 * fixtures file. They were invented numbers rendered as a business dashboard,
 * which is the most dangerous kind of dummy data: it looks like a basis for a
 * decision.
 *
 * Real analytics needs aggregate queries that do not exist yet. Until they do,
 * the honest thing is to point at the pages that count real records.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Analytics
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Trend reporting is not built yet.
        </p>
      </div>

      <EmptyState
        title="No trends to show"
        body="The charts that used to be here were invented figures, not measurements, so they have been removed. The dashboard and finance pages count real records in the meantime."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/portal/admin"
              className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
            >
              Dashboard
            </Link>
            <Link
              href="/portal/admin/finance"
              className="inline-block rounded-full border border-app-border px-6 py-2.5 text-[0.88rem] font-medium text-app-ink"
            >
              Finance
            </Link>
          </div>
        }
      />
    </div>
  )
}
