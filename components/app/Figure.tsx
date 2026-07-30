'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Chart } from '@/types/dashboard'

const INK = '#14171a'
const MUTED = '#5b646c'
const GRID = '#e3e6e9'
const PRIMARY = '#8a5a00'
const COMPARE = '#3a6ea5'

/*
 * `fill`, not `stroke`: tick labels are SVG text, so stroke outlines the glyphs
 * and leaves the fill at Recharts' default grey — off-token and lower contrast
 * than intended.
 */
const axis = { fill: MUTED, fontSize: 12 }

/**
 * A chart is never shown on its own: the takeaway sits above it because the
 * number is not the insight, and a text equivalent sits underneath for anyone
 * not reading the picture.
 *
 * Restrained on purpose — no gradients, no 3D, two series maximum.
 */
export default function Figure({
  chart,
  kind = 'line',
  height = 220,
  unit = '',
}: {
  chart: Chart
  kind?: 'line' | 'bar'
  height?: number
  unit?: string
}) {
  const hasCompare = chart.points.some((p) => p.compare != null)

  return (
    <figure className="m-0">
      <figcaption className="mb-4 text-[0.92rem] leading-relaxed font-medium text-app-ink">
        {chart.takeaway}
      </figcaption>

      <div aria-hidden style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'bar' ? (
            <BarChart data={chart.points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${GRID}`,
                  fontSize: 13,
                  color: INK,
                }}
                formatter={(v) => `${v}${unit}`}
              />
              <Bar dataKey="value" name={chart.seriesLabel} fill={PRIMARY} radius={[4, 4, 0, 0]} />
              {hasCompare && (
                <Bar
                  dataKey="compare"
                  name={chart.compareLabel}
                  fill={COMPARE}
                  radius={[4, 4, 0, 0]}
                />
              )}
              {hasCompare && <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />}
            </BarChart>
          ) : (
            <LineChart data={chart.points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${GRID}`,
                  fontSize: 13,
                  color: INK,
                }}
                formatter={(v) => `${v}${unit}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={chart.seriesLabel}
                stroke={PRIMARY}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              {hasCompare && (
                <Line
                  type="monotone"
                  dataKey="compare"
                  name={chart.compareLabel}
                  stroke={COMPARE}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3 }}
                />
              )}
              {hasCompare && <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-[0.82rem] leading-relaxed font-light text-app-muted">
        {chart.textEquivalent}
      </p>
    </figure>
  )
}
