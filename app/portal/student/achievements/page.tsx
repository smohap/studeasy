import { Award, Flame } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getGamification, getMyCertificates } from '@/lib/assessments-data'
import { EmptyState, Panel } from '@/components/app/Ui'

export const metadata = { title: 'Achievements — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  const [certificates, game] = await Promise.all([getMyCertificates(), getGamification()])

  return (
    <div className="flex flex-col gap-6">
      {/* Real XP and streak — touch_streak() has been recording these all along. */}
      <Panel title="Your progress" subtitle="Live account data.">
        {game ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Level" value={String(game.level)} />
            <Stat label="XP" value={String(game.xp)} />
            <Stat
              label="Current streak"
              value={`${game.streak_days} ${game.streak_days === 1 ? 'day' : 'days'}`}
              icon
            />
            <Stat label="Longest streak" value={`${game.longest_streak} days`} />
          </dl>
        ) : (
          <EmptyState
            title="Nothing recorded yet"
            body="Hand in an assignment, finish a lesson or sit an assessment — XP and your streak start from there."
          />
        )}
      </Panel>

      <Panel title="Certificates" subtitle="Issued automatically when you pass.">
        {certificates.length === 0 ? (
          <EmptyState
            title="No certificates yet"
            body="Pass an assessment that offers one and it appears here, with a serial anyone can verify."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {certificates.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="flex items-start gap-3">
                  <Award size={20} aria-hidden className="mt-0.5 shrink-0 text-accent-deep" />
                  <div>
                    <p className="text-[0.95rem] font-medium">{c.title}</p>
                    <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                      Issued{' '}
                      {new Date(c.issued_at).toLocaleDateString('en-NZ', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[0.84rem] text-app-muted">{c.serial}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-app-border p-4">
      <dt className="text-[0.76rem] font-medium tracking-[0.12em] text-app-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 flex items-center gap-2 text-[1.4rem] leading-none font-semibold">
        {icon && <Flame size={18} aria-hidden className="text-accent-deep" />}
        {value}
      </dd>
    </div>
  )
}
