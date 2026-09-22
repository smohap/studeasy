import type { HouseStanding } from '@/lib/economy-types'

/**
 * Four house totals and this student's own contribution to their own house.
 * There is no per-child ranking anywhere on this page — house_points RLS
 * restricts every student to their own rows, so a "your position" line could
 * not be built correctly even if it were wanted.
 */
export default function HouseCard({
  houses,
  myHouseId,
  contribution,
}: {
  houses: HouseStanding[]
  myHouseId: string | null
  contribution: number
}) {
  if (houses.length === 0) return null

  const ordered = [...houses].sort((a, b) => b.points - a.points)
  const max = Math.max(1, ...ordered.map((h) => h.points))
  const mine = myHouseId ? (ordered.find((h) => h.house_id === myHouseId) ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3" aria-label="House point totals">
        {ordered.map((house) => {
          const pct = Math.round((house.points / max) * 100)
          const isMine = house.house_id === myHouseId
          return (
            <li key={house.house_id}>
              <div className="mb-1 flex items-baseline justify-between text-[0.86rem]">
                {/* Distinguishable without colour: every bar carries its own
                    name and number, not just a coloured fill. */}
                <span className="font-medium text-app-ink">
                  {house.name}
                  {isMine && (
                    <span className="ml-1.5 text-[0.76rem] font-normal text-app-muted">
                      (your house)
                    </span>
                  )}
                </span>
                <span className="font-mono text-app-muted">
                  {house.points} {house.points === 1 ? 'point' : 'points'}
                </span>
              </div>
              <div
                role="img"
                aria-label={`${house.name}: ${house.points} points from ${house.members} members`}
                className="h-3 w-full overflow-hidden rounded-full bg-app-subtle"
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: house.colour }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {mine && (
        /* House totals and this student's own contribution. There is deliberately no
           per-child ranking here, and no view that could produce one. */
        <p className="text-sm text-slate-600">
          You have contributed {contribution} points to {mine.name} this term.
        </p>
      )}
    </div>
  )
}
