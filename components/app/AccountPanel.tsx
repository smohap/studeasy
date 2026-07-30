import type { Profile } from '@/lib/roles'
import { Panel } from './Ui'

/**
 * The signed-in student's real record — name, Student ID, year level, subjects.
 * Distinct from the fixture dashboard: everything here comes from the database.
 */
export default function AccountPanel({ profile }: { profile: Profile }) {
  return (
    <Panel
      title="Your account"
      subtitle="Your real StudEasy record. The dashboard below still uses demo data."
    >
      <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[0.76rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
            Name
          </dt>
          <dd className="mt-2 text-[1rem] font-medium text-app-ink">
            {profile.full_name ?? 'Not set'}
          </dd>
        </div>

        <div>
          <dt className="text-[0.76rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
            Student ID
          </dt>
          <dd className="mt-2 font-mono text-[1.15rem] font-semibold tracking-wide text-accent-deep">
            {profile.student_code ?? '—'}
          </dd>
          <p className="mt-2 max-w-xs text-[0.82rem] leading-relaxed font-light text-app-muted">
            Give this to a parent or caregiver so they can ask to follow your progress.
            You get to approve the request.
          </p>
        </div>

        <div>
          <dt className="text-[0.76rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
            Year level
          </dt>
          <dd className="mt-2 text-[1rem] font-light text-app-ink">
            {profile.year_level ?? 'Not set'}
          </dd>
        </div>

        <div>
          <dt className="text-[0.76rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
            Subjects
          </dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {profile.subjects.length > 0 ? (
              profile.subjects.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-app-border px-3 py-1 text-[0.83rem] font-light text-app-ink"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-[0.9rem] font-light text-app-muted">—</span>
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  )
}
