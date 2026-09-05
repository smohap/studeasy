'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCoinRate } from '@/app/portal/economy-actions'

export type CoinRate = { reason: string; coins: number; house_points: number }

const REASON_LABEL: Record<string, string> = {
  streak_day: 'Daily streak',
  lesson_completed: 'Lesson completed',
  challenge_completed: 'Challenge completed',
  battle_won: 'Battle won',
  badge_awarded: 'Badge awarded',
  assessment_passed: 'Assessment passed',
}

/**
 * Effort metrics are seeded higher than accuracy ones on purpose (economy.sql,
 * section 3) — streaks and lessons pay more house points than a passed
 * assessment does, so struggling students still have something to win.
 * Editable, but the note above the table stays visible so a future admin does
 * not flatten that on purpose without knowing why it was shaped this way.
 */
export default function RateEditor({ rates }: { rates: CoinRate[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      rates.map((r) => [r.reason, { coins: r.coins, housePoints: r.house_points }]),
    ),
  )
  const [savingReason, setSavingReason] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()

  function save(reason: string) {
    const row = rows[reason]
    if (!row) return
    setErrors((e) => ({ ...e, [reason]: '' }))
    setSavingReason(reason)
    start(async () => {
      const res = await setCoinRate(reason, row.coins, row.housePoints)
      if (res.error) setErrors((e) => ({ ...e, [reason]: res.error as string }))
      setSavingReason(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.84rem] font-light text-app-muted">
        House points weight effort — streaks, questions attempted, lessons
        finished — above accuracy on purpose, so a struggling student still has
        something to win. Raising the accuracy-linked rows above the
        effort-linked ones here undoes that; think about why the gap exists
        before closing it.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.86rem]">
          <thead>
            <tr className="border-b border-app-border text-[0.76rem] font-medium tracking-[0.06em] text-app-muted uppercase">
              <th scope="col" className="py-2 pr-3">
                Reason
              </th>
              <th scope="col" className="py-2 pr-3">
                Coins
              </th>
              <th scope="col" className="py-2 pr-3">
                House points
              </th>
              <th scope="col" className="py-2 pr-3">
                <span className="sr-only">Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => {
              const row = rows[rate.reason] ?? {
                coins: rate.coins,
                housePoints: rate.house_points,
              }
              const label = REASON_LABEL[rate.reason] ?? rate.reason
              const isSaving = pending && savingReason === rate.reason

              return (
                <tr key={rate.reason} className="border-b border-app-border last:border-0">
                  <td className="py-2 pr-3 font-medium text-app-ink">{label}</td>
                  <td className="py-2 pr-3">
                    <label className="sr-only" htmlFor={`coins-${rate.reason}`}>
                      Coins for {label}
                    </label>
                    <input
                      id={`coins-${rate.reason}`}
                      type="number"
                      min={0}
                      value={row.coins}
                      onChange={(e) =>
                        setRows((r) => ({
                          ...r,
                          [rate.reason]: { ...row, coins: Number(e.target.value) },
                        }))
                      }
                      className="w-20 rounded-lg border border-app-border bg-app px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <label className="sr-only" htmlFor={`hp-${rate.reason}`}>
                      House points for {label}
                    </label>
                    <input
                      id={`hp-${rate.reason}`}
                      type="number"
                      min={0}
                      value={row.housePoints}
                      onChange={(e) =>
                        setRows((r) => ({
                          ...r,
                          [rate.reason]: { ...row, housePoints: Number(e.target.value) },
                        }))
                      }
                      className="w-20 rounded-lg border border-app-border bg-app px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => save(rate.reason)}
                      aria-label={`Save rate for ${label}`}
                      className="rounded-lg bg-app-ink px-3 py-1.5 text-[0.82rem] font-medium text-white disabled:opacity-50"
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    {errors[rate.reason] && (
                      <p role="alert" className="mt-1 text-[0.78rem] font-light text-app-bad">
                        {errors[rate.reason]}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
