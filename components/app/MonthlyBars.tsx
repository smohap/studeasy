import { formatPrice } from '@/lib/catalog'
import type { MonthPoint } from '@/lib/analytics-data'

/**
 * A twelve-month bar list, drawn with divs rather than a charting library.
 *
 * Bars are scaled against the largest month, and every bar carries its own
 * figure in text beside it — the picture is the summary, the number is the
 * fact. A chart whose values can only be read by measuring pixels is
 * decoration.
 */
export default function MonthlyBars({
  points,
  label = 'Monthly',
}: {
  points: MonthPoint[]
  label?: string
}) {
  if (points.length === 0) {
    return (
      <p className="text-[0.86rem] font-light text-app-muted">
        Nothing settled in the last twelve months yet.
      </p>
    )
  }

  // Guarded at 1 so an all-zero series scales rather than dividing by zero.
  const peak = Math.max(...points.map((p) => p.cents), 1)

  return (
    <div>
      <p className="text-[0.74rem] font-medium tracking-[0.12em] text-app-muted uppercase">
        {label}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {points.map((p) => (
          <li key={p.month} className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-[0.78rem] text-app-muted">
              {p.month}
            </span>
            <span className="h-2.5 min-w-px flex-1 overflow-hidden rounded-full bg-app-border">
              <span
                className="block h-full rounded-full bg-accent-deep"
                style={{ width: `${Math.round((p.cents / peak) * 100)}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right text-[0.82rem] font-medium">
              {formatPrice(p.cents, 'NZD')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
