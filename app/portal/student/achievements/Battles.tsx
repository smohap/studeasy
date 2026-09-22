'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Swords } from 'lucide-react'
import type { Battle } from '@/lib/economy-types'
import { acceptBattle, declineBattle } from '@/app/portal/economy-actions'

const STATUS_LABEL: Record<Battle['status'], string> = {
  pending: 'Waiting to be accepted',
  accepted: 'In progress',
  declined: 'Declined',
  complete: 'Complete',
  expired: 'Expired',
}

export default function Battles({
  battles,
  myId,
  scores,
}: {
  battles: Battle[]
  myId: string
  /** Correct-answer counts for battles already complete, this side and theirs. */
  scores: Record<string, { mine: number; theirs: number }>
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()

  function respond(battleId: string, action: 'accept' | 'decline') {
    setErrors((e) => ({ ...e, [battleId]: '' }))
    setBusyId(battleId)
    start(async () => {
      const res =
        action === 'accept' ? await acceptBattle(battleId) : await declineBattle(battleId)
      if (res.error) setErrors((e) => ({ ...e, [battleId]: res.error as string }))
      setBusyId(null)
      router.refresh()
    })
  }

  if (battles.length === 0) {
    return (
      <p className="text-[0.88rem] font-light text-app-muted">
        No battles yet. A challenge from a classmate will appear here.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {battles.map((battle) => {
        const isBusy = pending && busyId === battle.id
        const score = scores[battle.id]

        return (
          <li
            key={battle.id}
            className="flex flex-col gap-2 rounded-xl border border-app-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[0.92rem] font-medium text-app-ink">
                <Swords size={16} aria-hidden className="text-accent-deep" />
                {battle.topic_name || 'Untitled topic'}
              </p>
              <span className="text-[0.8rem] font-light text-app-muted">
                {STATUS_LABEL[battle.status]}
              </span>
            </div>

            {battle.status === 'pending' && !battle.is_challenger && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => respond(battle.id, 'accept')}
                  aria-label={`Accept the battle on ${battle.topic_name}`}
                  className="rounded-lg bg-app-ink px-3 py-1.5 text-[0.84rem] font-medium text-white disabled:opacity-50"
                >
                  {isBusy ? 'Working…' : 'Accept'}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => respond(battle.id, 'decline')}
                  aria-label={`Decline the battle on ${battle.topic_name}`}
                  className="rounded-lg border border-app-border px-3 py-1.5 text-[0.84rem] font-light text-app-ink disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            )}

            {battle.status === 'pending' && battle.is_challenger && (
              <p className="text-[0.84rem] font-light text-app-muted">
                Waiting for them to respond.
              </p>
            )}

            {battle.status === 'accepted' && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.84rem] font-light text-app-muted">
                  Answered {battle.answered} of {battle.question_count}
                </p>
                <Link
                  href={`/portal/student/battles/${battle.id}`}
                  className="rounded-lg bg-app-ink px-3 py-1.5 text-[0.84rem] font-medium text-white"
                >
                  Play
                </Link>
              </div>
            )}

            {battle.status === 'complete' && (
              /*
               * Safe to show both sides here: battle_answers RLS only returns
               * the opponent's rows once the battle is complete, so this
               * branch never runs against an opponent still in progress.
               */
              <p className="text-[0.84rem] font-light text-app-muted">
                {score
                  ? `You: ${score.mine} correct · Opponent: ${score.theirs} correct`
                  : `${battle.answered} of ${battle.question_count} answered`}
                {' · '}
                {battle.winner_id === myId
                  ? 'You won.'
                  : battle.winner_id
                    ? 'They won.'
                    : 'A draw.'}
              </p>
            )}

            {(battle.status === 'declined' || battle.status === 'expired') && (
              <p className="text-[0.84rem] font-light text-app-muted">
                {battle.status === 'declined'
                  ? 'This challenge was declined.'
                  : 'This challenge expired unanswered.'}
              </p>
            )}

            {errors[battle.id] && (
              <p role="alert" className="text-[0.82rem] font-light text-app-bad">
                {errors[battle.id]}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
