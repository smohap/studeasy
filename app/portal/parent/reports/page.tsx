import Link from 'next/link'
import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getMyChildren } from '@/lib/family-data'
import { EmptyState, Panel } from '@/components/app/Ui'

export const metadata = { title: 'Progress reports — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'parent')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/family.sql to use this."
      />
    )
  }

  const children = await getMyChildren()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Progress reports
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Counted from work that has actually been marked and released. A mark a teacher
          has not released yet is their working out, not a result, so it is not here.
        </p>
      </div>

      {children.length === 0 ? (
        <EmptyState
          title="No children linked yet"
          body="Add your child from your portal, and their results appear here once their teacher releases the first mark."
          action={
            <Link
              href="/portal/parent"
              className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
            >
              Add a child
            </Link>
          }
        />
      ) : (
        children.map((c) => (
          <Panel
            key={c.id}
            title={c.fullName ?? 'Student'}
            subtitle={c.yearLevel ?? undefined}
          >
            {c.marked === 0 ? (
              <p className="text-[0.9rem] leading-relaxed font-light text-app-muted">
                {c.handedIn === 0
                  ? 'Nothing handed in yet.'
                  : `${c.handedIn} ${c.handedIn === 1 ? 'piece' : 'pieces'} handed in, none marked yet.`}
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Handed in" value={String(c.handedIn)} />
                <Stat label="Marked" value={String(c.marked)} />
                <Stat label="Average" value={`${c.averagePct}%`} />
              </dl>
            )}

            {c.upcoming.length > 0 && (
              <p className="mt-4 text-[0.86rem] font-light text-app-muted">
                {c.upcoming.length} {c.upcoming.length === 1 ? 'class' : 'classes'} coming
                up.
              </p>
            )}
          </Panel>
        ))
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-app-subtle p-3">
      <dt className="text-[0.75rem] font-medium text-app-muted">{label}</dt>
      <dd className="mt-1 text-[1.1rem] leading-snug font-semibold text-app-ink">
        {value}
      </dd>
    </div>
  )
}
