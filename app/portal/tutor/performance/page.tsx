import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { EmptyState } from '@/components/app/Ui'

export const metadata = { title: 'Performance — StudEasy', robots: { index: false } }

/*
 * This page charted attendance and grade improvement from a fixtures file —
 * invented figures about a teacher's own effectiveness, which is a bad thing to
 * be wrong about in either direction.
 *
 * Real teaching analytics needs aggregate queries that do not exist yet. The
 * pages that count real records are linked instead.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Performance
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Trend reporting is not built yet.
        </p>
      </div>

      <EmptyState
        title="No trends to show"
        body="The charts here were invented figures rather than measurements, so they have been removed. Your marking queue and class rosters count real records in the meantime."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/portal/tutor/marking"
              className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
            >
              Marking
            </Link>
            <Link
              href="/portal/tutor/students"
              className="inline-block rounded-full border border-app-border px-6 py-2.5 text-[0.88rem] font-medium text-app-ink"
            >
              My students
            </Link>
          </div>
        }
      />
    </div>
  )
}
