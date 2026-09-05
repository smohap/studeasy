'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

export type Result = { error: string | null }

const ACHIEVEMENTS_PATH = '/portal/student/achievements'

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
