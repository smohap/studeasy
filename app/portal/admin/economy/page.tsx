import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { EmptyState, Panel } from '@/components/app/Ui'
import RateEditor, { type CoinRate } from './RateEditor'
import ChallengeEditor, { type Challenge } from './ChallengeEditor'
import AdjustBalance, { type AdjustmentRow, type StudentOption } from './AdjustBalance'

export const metadata = { title: 'Economy — StudEasy', robots: { index: false } }

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables to use this."
      />
    )
  }

  const supabase = await createClient()

  const [{ data: rateRows }, { data: challengeRows }, { data: studentRows }, { data: adjustmentRows }] =
    await Promise.all([
      supabase.from('coin_rates').select('reason, coins, house_points').order('reason'),
      supabase
        .from('challenges')
        .select(
          'id, kind, period_start, period_end, title, description, metric, target, ' +
            'coin_reward, house_points_reward',
        )
        .order('period_start', { ascending: false })
        .limit(30),
      supabase
        .from('profiles')
        .select('id, full_name, student_code')
        .eq('role', 'student')
        .order('full_name'),
      supabase
        .from('coin_ledger')
        .select('id, delta, reason, note, created_at, profiles(full_name)')
        .eq('reason', 'admin_adjustment')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  const rates = (rateRows ?? []) as unknown as CoinRate[]
  const challenges = (challengeRows ?? []) as unknown as Challenge[]

  const students = ((studentRows ?? []) as unknown as {
    id: string
    full_name: string | null
    student_code: string | null
  }[]).map((s) => ({
    id: s.id,
    name: s.full_name ?? s.student_code ?? s.id,
  })) satisfies StudentOption[]

  type AdjustmentJoinRow = {
    id: string
    delta: number
    reason: string
    note: string | null
    created_at: string
    profiles: { full_name: string | null } | null
  }

  const adjustments = ((adjustmentRows ?? []) as unknown as AdjustmentJoinRow[]).map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    note: row.note,
    created_at: row.created_at,
    student_name: row.profiles?.full_name ?? 'Unknown student',
  })) satisfies AdjustmentRow[]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">Economy</h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Coin rates, challenges and the manual adjustment log. Every coin here is
          cosmetic — nothing in this economy carries real-world value.
        </p>
      </div>

      <Panel
        title="Coin rates"
        subtitle="What each event pays, per organization. Effort pays more than accuracy — see the note below."
      >
        {rates.length === 0 ? (
          <EmptyState
            title="No rates seeded"
            body="Run supabase/economy.sql against this database to seed default rates."
          />
        ) : (
          <RateEditor rates={rates} />
        )}
      </Panel>

      <Panel
        title="Challenges"
        subtitle="Author next week's or next month's challenge. Every metric here is effort-shaped."
      >
        <ChallengeEditor challenges={challenges} />
      </Panel>

      <Panel
        title="Manual adjustments"
        subtitle="Minting or removing coins by hand. Every one of these needs a note and lands in the same ledger a student's own activity does."
      >
        <AdjustBalance students={students} adjustments={adjustments} />
      </Panel>
    </div>
  )
}
