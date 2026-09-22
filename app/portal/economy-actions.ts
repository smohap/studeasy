'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

export type Result = { error: string | null }

export type ChallengeInput = {
  kind: 'weekly' | 'monthly'
  periodStart: string
  periodEnd: string
  title: string
  description: string
  metric:
    | 'questions_attempted'
    | 'topics_improved'
    | 'lessons_completed'
    | 'streak_days'
    | 'battles_played'
  target: number
  coinReward: number
  housePointsReward: number
}

const ACHIEVEMENTS_PATH = '/portal/student/achievements'
const ADMIN_ECONOMY_PATH = '/portal/admin/economy'

/** Wraps spend_coins(); the function checks ownership, level and affordability. */
export async function buyItem(itemId: string): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('spend_coins', { item: itemId })
  if (error) return { error: error.message }

  revalidatePath(ACHIEVEMENTS_PATH)
  return { error: null }
}

/** Wraps equip_item(); the function checks the caller actually owns it. */
export async function equipItem(itemId: string): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('equip_item', { item: itemId })
  if (error) return { error: error.message }

  revalidatePath(ACHIEVEMENTS_PATH)
  return { error: null }
}

/** Wraps create_battle(); the function checks the opponent shares the tenant. */
export async function challengeStudent(opponentId: string, topicId: string): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_battle', {
    opponent: opponentId,
    topic: topicId,
  })
  if (error) return { error: error.message }

  revalidatePath(ACHIEVEMENTS_PATH)
  return { error: null }
}

/** Wraps accept_battle(); the function draws the shared question set. */
export async function acceptBattle(battleId: string): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_battle', { battle: battleId })
  if (error) return { error: error.message }

  revalidatePath(ACHIEVEMENTS_PATH)
  return { error: null }
}

/*
 * The brief that specced this file names five RPCs to wrap and none of them is
 * a decline path, yet the achievements page (Task 23) is asked for an Accept
 * *and* Decline control on a pending battle. There is no other way to write
 * that row — battles carries no update grant for authenticated, only select —
 * so decline_battle() is added to supabase/economy.sql alongside this action,
 * mirroring accept_battle()'s own guard (opponent only, pending only).
 */
export async function declineBattle(battleId: string): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_battle', { battle: battleId })
  if (error) return { error: error.message }

  revalidatePath(ACHIEVEMENTS_PATH)
  return { error: null }
}

/** Wraps answer_battle(); the function marks correctness and may complete it. */
export async function answerBattleQuestion(
  battleId: string,
  questionId: string,
  response: unknown,
  seconds: number,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('answer_battle', {
    battle: battleId,
    question: questionId,
    response,
    seconds,
  })
  if (error) return { error: error.message }

  revalidatePath(ACHIEVEMENTS_PATH)
  return { error: null }
}

/**
 * An ordinary RLS-guarded write, not an RPC — coin_rates_write already
 * restricts this table to an admin of their own organization (Task 16), so
 * the check here is only "signed in", and the database refuses the rest.
 */
export async function setCoinRate(
  reason: string,
  coins: number,
  housePoints: number,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.from('coin_rates').upsert(
    {
      organization_id: profile.organization_id,
      reason,
      coins,
      house_points: housePoints,
    },
    { onConflict: 'organization_id,reason' },
  )
  if (error) return { error: error.message }

  revalidatePath(ADMIN_ECONOMY_PATH)
  return { error: null }
}

/** Also an ordinary RLS-guarded write — challenges_write is admin-only (Task 19). */
export async function createChallenge(input: ChallengeInput): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }
  if (!input.title.trim()) return { error: 'Give the challenge a title.' }
  if (input.target <= 0) return { error: 'The target must be greater than zero.' }
  if (input.periodEnd < input.periodStart) {
    return { error: 'The end date must not be before the start date.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('challenges').insert({
    organization_id: profile.organization_id,
    kind: input.kind,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    title: input.title.trim(),
    description: input.description.trim() || null,
    metric: input.metric,
    target: input.target,
    coin_reward: input.coinReward,
    house_points_reward: input.housePointsReward,
  })
  if (error) return { error: error.message }

  revalidatePath(ADMIN_ECONOMY_PATH)
  return { error: null }
}

/**
 * Wraps adjust_balance(); the function itself checks is_admin(), rejects a
 * zero delta and requires a note — this action only forwards what was typed.
 */
export async function adjustBalance(
  profileId: string,
  delta: number,
  note: string,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('adjust_balance', {
    student: profileId,
    delta,
    note,
  })
  if (error) return { error: error.message }

  revalidatePath(ADMIN_ECONOMY_PATH)
  return { error: null }
}
