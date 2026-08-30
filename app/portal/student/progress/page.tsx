import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getStudentAssignments } from '@/lib/assignments'
import { getGamification } from '@/lib/assessments-data'
import { EmptyState, Panel, StatTile } from '@/components/app/Ui'

export const metadata = { title: 'My progress — StudEasy', robots: { index: false } }

/*
 * This page used to draw mastery and streak charts from a fixtures file, so
 * every student saw the same invented progress. These are their own marks.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  const [assignments, game] = await Promise.all([
    getStudentAssignments(),
    getGamification(),
  ])

  // Only released marks. An unreleased one is the teacher's working out.
  const marked = assignments.filter(
    (a) => a.submission?.released && a.submission.marks != null && a.max_marks > 0,
  )
  const average =
    marked.length > 0
      ? Math.round(
          marked.reduce(
            (sum, a) => sum + ((a.submission!.marks ?? 0) / a.max_marks) * 100,
            0,
          ) / marked.length,
        )
      : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          My progress
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          {profile?.year_level ?? 'Your results so far'}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <StatTile label="Marked" value={String(marked.length)} />
        </li>
        <li>
          <StatTile label="Average" value={average == null ? '—' : `${average}%`} />
        </li>
        <li>
          <StatTile label="Day streak" value={String(game?.streak_days ?? 0)} />
        </li>
        <li>
          <StatTile label="Level" value={String(game?.level ?? 1)} />
        </li>
      </ul>

      <Panel title="Marked work" subtitle="Newest first.">
        {marked.length === 0 ? (
          <EmptyState
            title="Nothing marked yet"
            body="Once a teacher releases a mark it appears here, with the feedback they left."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {marked.map((a) => {
              const pct = Math.round(((a.submission!.marks ?? 0) / a.max_marks) * 100)
              return (
                <li key={a.id} className="rounded-xl border border-app-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.95rem] font-medium text-app-ink">{a.title}</p>
                      <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                        {a.course?.title ?? a.klass?.title ?? 'StudEasy'}
                      </p>
                    </div>
                    <p className="text-[0.95rem] font-semibold text-app-ink">
                      {a.submission!.marks}/{a.max_marks}{' '}
                      <span className="font-light text-app-muted">({pct}%)</span>
                    </p>
                  </div>
                  {a.submission!.feedback && (
                    <p className="mt-3 rounded-lg bg-app-subtle p-3 text-[0.87rem] leading-relaxed font-light text-app-ink">
                      <span className="font-medium">Feedback:</span>{' '}
                      {a.submission!.feedback}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
