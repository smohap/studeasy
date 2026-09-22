import { createClient, isAuthConfigured } from '@/lib/supabase/server'
import type { Battle, ChallengeProgress, HouseStanding, ShopItem } from './economy-types'

/** Coin balance for one student, read from the ledger's own view. */
export async function getBalance(profileId: string): Promise<number> {
  if (!isAuthConfigured) return 0
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('coin_balances')
    .select('balance')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error || !data) return 0

  return Number((data as unknown as { balance: number }).balance)
}

/** Every active shop item, with `owned` filled from the caller's purchases. */
export async function getShop(profileId: string): Promise<ShopItem[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const [{ data, error }, { data: purchases }] = await Promise.all([
    supabase
      .from('shop_items')
      .select('id, code, name, description, kind, asset_key, cost_coins, min_level')
      .eq('active', true)
      .order('sort', { ascending: true }),
    supabase.from('shop_purchases').select('item_id').eq('profile_id', profileId),
  ])

  if (error || !data) return []

  type Row = {
    id: string
    code: string
    name: string
    description: string | null
    kind: ShopItem['kind']
    asset_key: string
    cost_coins: number
    min_level: number
  }

  const owned = new Set(
    ((purchases ?? []) as unknown as { item_id: string }[]).map((p) => p.item_id),
  )

  return (data as unknown as Row[]).map((row) => ({
    ...row,
    owned: owned.has(row.id),
  }))
}

/**
 * House totals only — house_standings is a security_invoker=false view, so a
 * student reads whole-house sums even though house_points itself restricts
 * each row to its own owner. There is no view anywhere that ranks students.
 */
export async function getHouseStandings(): Promise<HouseStanding[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('house_standings')
    .select('house_id, name, colour, points, members')
    .order('sort', { ascending: true })

  if (error || !data) return []

  return data as unknown as HouseStanding[]
}

/** This student's own house_points rows, summed. RLS already limits the read. */
export async function getMyContribution(profileId: string): Promise<number> {
  if (!isAuthConfigured) return 0
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('house_points')
    .select('delta')
    .eq('profile_id', profileId)

  if (error || !data) return 0

  return (data as unknown as { delta: number }[]).reduce((sum, row) => sum + row.delta, 0)
}

/** Challenges open in the current period, with this student's own progress. */
export async function getChallenges(profileId: string): Promise<ChallengeProgress[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('challenges')
    .select('id, title, description, metric, target, period_end')
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_end', { ascending: true })

  if (error || !data) return []

  type ChallengeRow = {
    id: string
    title: string
    description: string | null
    metric: string
    target: number
    period_end: string
  }

  const challenges = data as unknown as ChallengeRow[]
  const ids = challenges.map((c) => c.id)
  if (ids.length === 0) return []

  const { data: progress } = await supabase
    .from('challenge_progress')
    .select('challenge_id, value, completed_at')
    .eq('profile_id', profileId)
    .in('challenge_id', ids)

  type ProgressRow = { challenge_id: string; value: number; completed_at: string | null }
  const byChallenge = new Map(
    ((progress ?? []) as unknown as ProgressRow[]).map((p) => [p.challenge_id, p]),
  )

  return challenges.map((c) => {
    const p = byChallenge.get(c.id)
    return {
      challenge_id: c.id,
      title: c.title,
      description: c.description,
      metric: c.metric,
      target: c.target,
      value: p?.value ?? 0,
      completed_at: p?.completed_at ?? null,
      period_end: c.period_end,
    }
  })
}

/**
 * This student's battles, either side. `answered` counts only the caller's own
 * rows in battle_answers — RLS hides the opponent's until the battle is
 * complete, so an incomplete battle never reveals their progress here either.
 */
export async function getBattles(profileId: string): Promise<Battle[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('battles')
    .select(
      'id, status, challenger_id, opponent_id, winner_id, question_count, expires_at, ' +
        'created_at, topics(name)',
    )
    .or(`challenger_id.eq.${profileId},opponent_id.eq.${profileId}`)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  type Row = {
    id: string
    status: Battle['status']
    challenger_id: string
    opponent_id: string
    winner_id: string | null
    question_count: number
    expires_at: string
    topics: { name: string } | null
  }

  const rows = data as unknown as Row[]
  const ids = rows.map((r) => r.id)

  const { data: answers } =
    ids.length > 0
      ? await supabase
          .from('battle_answers')
          .select('battle_id')
          .eq('profile_id', profileId)
          .in('battle_id', ids)
      : { data: [] }

  const answered = new Map<string, number>()
  for (const row of (answers ?? []) as unknown as { battle_id: string }[]) {
    answered.set(row.battle_id, (answered.get(row.battle_id) ?? 0) + 1)
  }

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    topic_name: row.topics?.name ?? '',
    is_challenger: row.challenger_id === profileId,
    winner_id: row.winner_id,
    question_count: row.question_count,
    answered: answered.get(row.id) ?? 0,
    expires_at: row.expires_at,
  }))
}
