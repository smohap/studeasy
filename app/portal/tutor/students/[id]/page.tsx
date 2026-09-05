import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getMastery, getProjections } from '@/lib/twin-data'
import { masteryBand } from '@/lib/twin-format'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import ReviewProjection from './ReviewProjection'

export const metadata = { title: 'Student — StudEasy', robots: { index: false } }

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
 * A tutor's view of one student's Learning Twin: the mastery it was built
 * from, and the projections they can review before a parent ever sees them.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  const [mastery, projections] = await Promise.all([getMastery(id), getProjections(id)])

  let studentName = 'Student'
  if (isAuthConfigured) {
    const supabase = await createClient()
    const { data: student } = await supabase
      .from('profiles')
      .select('full_name, student_code')
      .eq('id', id)
      .maybeSingle()
    const row = student as { full_name: string | null; student_code: string | null } | null
    if (row?.full_name) studentName = row.full_name
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          {studentName}
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Their Learning Twin — the mastery it was built from, and the projections you can
          release to their parent.
        </p>
      </div>

      <Panel title="Standard projections" subtitle="Review before a parent sees these.">
        {projections.length === 0 ? (
          <EmptyState
            title="No projections yet"
            body="Projections appear once questions this student has answered are tagged to a curriculum standard."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {projections.map((p) => (
              <ReviewProjection key={p.topic_id} studentId={id} projection={p} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Topic mastery" subtitle="Weakest first.">
        {mastery.length === 0 ? (
          <EmptyState
            title="Nothing to show yet"
            body="Once this student has answered some tagged questions, mastery per topic appears here."
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
    </div>
  )
}
