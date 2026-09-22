'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createChallenge, type ChallengeInput } from '@/app/portal/economy-actions'

export type Challenge = {
  id: string
  kind: ChallengeInput['kind']
  period_start: string
  period_end: string
  title: string
  description: string | null
  metric: ChallengeInput['metric']
  target: number
  coin_reward: number
  house_points_reward: number
}

const METRIC_LABEL: Record<ChallengeInput['metric'], string> = {
  questions_attempted: 'Questions attempted',
  topics_improved: 'Topics improved',
  lessons_completed: 'Lessons completed',
  streak_days: 'Streak days',
  battles_played: 'Battles played',
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

function todayPlus(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Every metric here is effort-shaped — the check constraint in economy.sql
    does not allow an accuracy metric to be added by mistake. */
export default function ChallengeEditor({ challenges }: { challenges: Challenge[] }) {
  const router = useRouter()
  const [kind, setKind] = useState<ChallengeInput['kind']>('weekly')
  const [periodStart, setPeriodStart] = useState(todayPlus(0))
  const [periodEnd, setPeriodEnd] = useState(todayPlus(7))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [metric, setMetric] = useState<ChallengeInput['metric']>('questions_attempted')
  const [target, setTarget] = useState('10')
  const [coinReward, setCoinReward] = useState('50')
  const [housePointsReward, setHousePointsReward] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function pickKind(next: ChallengeInput['kind']) {
    setKind(next)
    setPeriodStart(todayPlus(0))
    setPeriodEnd(todayPlus(next === 'weekly' ? 7 : 30))
  }

  function submit() {
    setError(null)
    setDone(false)
    start(async () => {
      const res = await createChallenge({
        kind,
        periodStart,
        periodEnd,
        title,
        description,
        metric,
        target: Number(target),
        coinReward: Number(coinReward),
        housePointsReward: Number(housePointsReward),
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(true)
      setTitle('')
      setDescription('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border border-app-border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="ch-kind">
              Length
            </label>
            <select
              id="ch-kind"
              className={`${field} mt-1.5`}
              value={kind}
              onChange={(e) => pickKind(e.target.value as ChallengeInput['kind'])}
            >
              <option value="weekly">Next week</option>
              <option value="monthly">Next month</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ch-metric">
              Metric — an effort measure, not accuracy
            </label>
            <select
              id="ch-metric"
              className={`${field} mt-1.5`}
              value={metric}
              onChange={(e) => setMetric(e.target.value as ChallengeInput['metric'])}
            >
              {Object.entries(METRIC_LABEL).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="ch-start">
              Starts
            </label>
            <input
              id="ch-start"
              type="date"
              className={`${field} mt-1.5`}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="ch-end">
              Ends
            </label>
            <input
              id="ch-end"
              type="date"
              className={`${field} mt-1.5`}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="ch-title">
            Title
          </label>
          <input
            id="ch-title"
            className={`${field} mt-1.5`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ten questions this week"
          />
        </div>

        <div>
          <label className={label} htmlFor="ch-desc">
            Description
          </label>
          <input
            id="ch-desc"
            className={`${field} mt-1.5`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="ch-target">
              Target
            </label>
            <input
              id="ch-target"
              type="number"
              min={1}
              className={`${field} mt-1.5`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="ch-coins">
              Coin reward
            </label>
            <input
              id="ch-coins"
              type="number"
              min={0}
              className={`${field} mt-1.5`}
              value={coinReward}
              onChange={(e) => setCoinReward(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="ch-hp">
              House points reward
            </label>
            <input
              id="ch-hp"
              type="number"
              min={0}
              className={`${field} mt-1.5`}
              value={housePointsReward}
              onChange={(e) => setHousePointsReward(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[0.85rem] font-light text-app-bad">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-[0.85rem] font-light text-app-good">
            Challenge created.
          </p>
        )}

        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={submit}
          className="self-start rounded-lg bg-app-ink px-4 py-2 text-[0.86rem] font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create challenge'}
        </button>
      </div>

      {challenges.length === 0 ? (
        <p className="text-[0.88rem] font-light text-app-muted">
          No challenge has been published yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {challenges.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-3.5"
            >
              <div className="min-w-0">
                <p className="text-[0.9rem] font-medium text-app-ink">{c.title}</p>
                <p className="mt-0.5 text-[0.8rem] font-light text-app-muted">
                  {METRIC_LABEL[c.metric] ?? c.metric} · target {c.target} · {c.period_start} to{' '}
                  {c.period_end}
                </p>
              </div>
              <span className="text-[0.82rem] font-light text-app-muted">
                {c.coin_reward} coins · {c.house_points_reward} house pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
