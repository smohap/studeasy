import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getStudentAssignments } from '@/lib/assignments'
import { getGamification } from '@/lib/assessments-data'
import { getMastery, getProjections } from '@/lib/twin-data'
import { gradeLabel, confidenceSentence, masteryBand } from '@/lib/twin-format'
import { EmptyState, Panel, StatTile, StatusChip } from '@/components/app/Ui'

export const metadata = { title: 'My progress — StudEasy', robots: { index: false } }

const MASTERY_TONE = {
  building: 'bad',
  developing: 'warn',
  secure: 'good',
} as const

const MASTERY_LABEL = {
  building: 'Building',
  developing: 'Developing',
  secure: 'Secure',
} as const

/*
 * This page used to draw mastery and streak charts from a fixtures file, so
 * every student saw the same invented progress. These are their own marks.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  const [assignments, game, projections, mastery] = await Promise.all([
    getStudentAssignments(),
    getGamification(),
    profile ? getProjections(profile.id) : Promise.resolve([]),
    profile ? getMastery(profile.id) : Promise.resolve([]),
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

      <Panel
        title="Standard projections"
        subtitle="What your evidence points to, and how sure it is."
      >
        {projections.length === 0 ? (
          <EmptyState
            title="No projections yet"
            body="They appear once your tutors have tagged the questions you have answered to a curriculum standard."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {projections.map((p) => (
              <li key={p.topic_id} className="rounded-xl border border-app-border p-4">
                <h3 className="text-[0.95rem] font-medium text-app-ink">
                  {p.standard_code} — {p.standard_name}
                </h3>
                {/* A grade never appears without the sentence beside it that says what
                    it is standing on — a bare grade reads as a verdict, not evidence. */}
                <p className="mt-1 text-[1.6rem] font-semibold tracking-tight text-app-ink">
                  {gradeLabel(p.projected_grade)}
                </p>
                <p className="mt-1 text-[0.85rem] font-light text-app-muted">
                  {confidenceSentence(p.confidence, p.seen)}
                </p>
                {p.levers.length > 0 && (
                  <>
                    <p className="mt-3 text-[0.85rem] font-medium text-app-ink">
                      What would move it
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-[0.85rem] font-light text-app-muted">
                      {p.levers.slice(0, 3).map((l) => (
                        <li key={l.topic_id}>{l.name}</li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Topic mastery" subtitle="Weakest first — start here.">
        {mastery.length === 0 ? (
          <EmptyState
            title="Nothing to show yet"
            body="Once you have answered some tagged questions, your mastery per topic appears here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {mastery.map((m) => {
              const band = masteryBand(m.mastery)
              return (
                <li
                  key={m.topic_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-4"
                >
                  <div className="min-w-0">
                    <p className="text-[0.9rem] font-medium text-app-ink">
                      {m.topic_code ? `${m.topic_code} — ${m.topic_name}` : m.topic_name}
                    </p>
                    <p className="mt-0.5 text-[0.8rem] font-light text-app-muted">
                      {m.seen_count} question{m.seen_count === 1 ? '' : 's'} seen
                    </p>
                  </div>
                  <StatusChip status={{ tone: MASTERY_TONE[band], label: MASTERY_LABEL[band] }} />
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

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
