import Link from 'next/link'
import { Award, Flame, Lock, Medal } from 'lucide-react'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getGamification, getMyBadges, getMyCertificates } from '@/lib/assessments-data'
import {
  getBalance,
  getBattles,
  getChallenges,
  getHouseStandings,
  getMyContribution,
  getShop,
} from '@/lib/economy-data'
import type { Battle } from '@/lib/economy-types'
import { EmptyState, Panel } from '@/components/app/Ui'
import Shop from './Shop'
import HouseCard from './HouseCard'
import Battles from './Battles'

export const metadata = { title: 'Achievements — StudEasy', robots: { index: false } }

const METRIC_LABEL: Record<string, string> = {
  questions_attempted: 'questions attempted',
  topics_improved: 'topics improved',
  lessons_completed: 'lessons completed',
  streak_days: 'day streak',
  battles_played: 'battles played',
}

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'student')

  const [certificates, game, badges, balance, shop, houses, contribution, challenges, battles] =
    await Promise.all([
      getMyCertificates(),
      getGamification(),
      getMyBadges(),
      profile ? getBalance(profile.id) : Promise.resolve(0),
      profile ? getShop(profile.id) : Promise.resolve([]),
      getHouseStandings(),
      profile ? getMyContribution(profile.id) : Promise.resolve(0),
      profile ? getChallenges(profile.id) : Promise.resolve([]),
      profile ? getBattles(profile.id) : Promise.resolve([]),
    ])

  const earnedCount = badges.filter((b) => b.awardedAt).length

  /*
   * Two lookups the typed data layer deliberately does not carry, because
   * neither belongs in a function reused elsewhere:
   *
   *   - which house is "mine". Profile (lib/roles.ts) does not carry
   *     house_id, and house_standings is aggregate-only by design, so the
   *     student's own house_id is read directly here, the same way
   *     app/portal/admin/finance/page.tsx reads orders and payouts directly
   *     alongside its data-layer calls.
   *
   *   - correct-answer counts for a battle's two sides, once it is complete.
   *     getBattles() reports only the caller's own answered *count* (Task 22),
   *     matching the rule that an unfinished battle must not leak the
   *     opponent's progress. Once a battle is complete, RLS opens the
   *     opponent's rows too, and the score comparison in the corrections is
   *     read here rather than folded into the shared Battle type.
   */
  let myHouseId: string | null = null
  const battleScores: Record<string, { mine: number; theirs: number }> = {}

  if (isAuthConfigured && profile) {
    const supabase = await createClient()
    const completeIds = battles.filter((b) => b.status === 'complete').map((b) => b.id)

    const [{ data: houseRow }, { data: meta }, { data: answers }] = await Promise.all([
      supabase.from('profiles').select('house_id').eq('id', profile.id).maybeSingle(),
      completeIds.length > 0
        ? supabase.from('battles').select('id, challenger_id, opponent_id').in('id', completeIds)
        : Promise.resolve({ data: [] as { id: string; challenger_id: string; opponent_id: string }[] }),
      completeIds.length > 0
        ? supabase
            .from('battle_answers')
            .select('battle_id, profile_id, correct')
            .in('battle_id', completeIds)
        : Promise.resolve({ data: [] as { battle_id: string; profile_id: string; correct: boolean }[] }),
    ])

    myHouseId = (houseRow as { house_id: string | null } | null)?.house_id ?? null

    const sides = new Map(
      ((meta ?? []) as { id: string; challenger_id: string; opponent_id: string }[]).map((m) => [
        m.id,
        m,
      ]),
    )

    for (const a of (answers ?? []) as { battle_id: string; profile_id: string; correct: boolean }[]) {
      if (!a.correct) continue
      const side = sides.get(a.battle_id)
      if (!side) continue

      const iAmChallenger = side.challenger_id === profile.id
      const isMine =
        (iAmChallenger && a.profile_id === side.challenger_id) ||
        (!iAmChallenger && a.profile_id === side.opponent_id)

      const entry = battleScores[a.battle_id] ?? { mine: 0, theirs: 0 }
      if (isMine) entry.mine += 1
      else entry.theirs += 1
      battleScores[a.battle_id] = entry
    }
  }

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

      {/*
        * Locked badges are shown too. A wall of only what you already have
        * says nothing about what is worth doing next.
        */}
      <Panel
        title="Badges"
        subtitle={
          badges.length === 0
            ? 'Awarded automatically from work you have already done.'
            : `${earnedCount} of ${badges.length} earned. Awarded automatically — nothing here is given for signing up.`
        }
      >
        {badges.length === 0 ? (
          <EmptyState
            title="No badges set up"
            body="This organisation has not published a badge catalogue yet."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {badges.map((b) => {
              const earned = Boolean(b.awardedAt)
              return (
                <li
                  key={b.code}
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    earned ? 'border-app-border' : 'border-dashed border-app-border opacity-60'
                  }`}
                >
                  {earned ? (
                    <Medal size={20} aria-hidden className="mt-0.5 shrink-0 text-accent-deep" />
                  ) : (
                    <Lock size={20} aria-hidden className="mt-0.5 shrink-0 text-app-muted" />
                  )}
                  <div>
                    <p className="text-[0.95rem] font-medium">
                      {b.name}
                      {!earned && <span className="sr-only"> — not yet earned</span>}
                    </p>
                    {b.description && (
                      <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                        {b.description}
                      </p>
                    )}
                    {b.awardedAt && (
                      <p className="mt-1 text-[0.8rem] font-light text-app-muted">
                        Earned{' '}
                        {new Date(b.awardedAt).toLocaleDateString('en-NZ', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Certificates"
        subtitle="Issued automatically when you pass. Anyone can check a serial at /verify — no StudEasy account needed."
      >
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
                {/*
                  * The serial is the point of a certificate: somebody outside
                  * StudEasy has to be able to check it.
                  */}
                <Link
                  href={`/verify/${c.serial}`}
                  className="font-mono text-[0.84rem] text-app-muted underline-offset-4 hover:text-app-ink hover:underline"
                >
                  {c.serial}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Coins are cosmetic — nothing sold here carries real-world value. */}
      <Panel
        title="Coins and the shop"
        subtitle="Earned from streaks, lessons, challenges and battles. Spend them on cosmetics only."
      >
        <Shop items={shop} balance={balance} level={game?.level ?? 1} />
      </Panel>

      <Panel
        title="Your house"
        subtitle="The only ranking on StudEasy is house against house, never child against child."
      >
        <HouseCard houses={houses} myHouseId={myHouseId} contribution={contribution} />
      </Panel>

      <Panel
        title="Open challenges"
        subtitle="Every metric here rewards effort — attempting, finishing, showing up — not accuracy."
      >
        {challenges.length === 0 ? (
          <EmptyState
            title="No challenge running"
            body="Your organisation has not published one for this period yet."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((c.value / c.target) * 100))
              const done = Boolean(c.completed_at)
              return (
                <li key={c.challenge_id} className="rounded-xl border border-app-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[0.92rem] font-medium text-app-ink">{c.title}</p>
                    <span className="text-[0.8rem] font-light text-app-muted">
                      {c.value} of {c.target} {METRIC_LABEL[c.metric] ?? c.metric}
                    </span>
                  </div>
                  {c.description && (
                    <p className="mt-1 text-[0.84rem] font-light text-app-muted">
                      {c.description}
                    </p>
                  )}
                  <div
                    role="img"
                    aria-label={`${pct}% complete, ${c.value} of ${c.target}`}
                    className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-app-subtle"
                  >
                    <div
                      className={`h-full rounded-full ${done ? 'bg-app-good' : 'bg-accent-deep'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {done && (
                    <p className="mt-1.5 text-[0.8rem] font-medium text-app-good">Completed</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Battles"
        subtitle="Best of the questions you both answer. A battle stays private between the two of you until it is finished."
      >
        <Battles battles={battles as Battle[]} myId={profile?.id ?? ''} scores={battleScores} />
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
