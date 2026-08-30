import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Status, StatusTone } from '@/types/dashboard'

/** The five building blocks every dashboard panel is made of. */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-2xl border border-app-border bg-app-panel ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border px-5 py-4">
          <div>
            {title && (
              <h2 className="text-[1rem] font-semibold tracking-tight text-app-ink">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[0.85rem] leading-relaxed font-light text-app-muted">
                {subtitle}
              </p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

const TONE: Record<StatusTone, string> = {
  good: 'bg-app-good-bg text-app-good',
  warn: 'bg-app-warn-bg text-app-warn',
  bad: 'bg-app-bad-bg text-app-bad',
  neutral: 'bg-app-subtle text-app-muted',
}

/**
 * Status is always rendered as text on a tinted chip. The colour reinforces the
 * label; it never carries the meaning on its own.
 */
export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-medium ${TONE[status.tone]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.label}
    </span>
  )
}

export function StatTile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
}: {
  label: string
  value: string
  delta?: string
  deltaTone?: StatusTone
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-panel p-4">
      <p className="text-[0.78rem] font-medium text-app-muted">{label}</p>
      <p className="mt-2 text-[1.6rem] leading-none font-semibold tracking-tight text-app-ink">
        {value}
      </p>
      {delta && (
        <p
          className={`mt-2 text-[0.8rem] font-medium ${
            deltaTone === 'good'
              ? 'text-app-good'
              : deltaTone === 'warn' || deltaTone === 'bad'
                ? 'text-app-warn'
                : 'text-app-muted'
          }`}
        >
          {delta} <span className="font-light text-app-muted">vs last period</span>
        </p>
      )}
    </div>
  )
}

/**
 * Empty states say what happens next. A new student sees these on day one, so
 * a blank card would be the wrong answer.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-app-border px-5 py-8 text-center">
      <p className="text-[0.95rem] font-medium text-app-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[0.88rem] leading-relaxed font-light text-app-muted">
        {body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2.5">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="block h-3 rounded-full bg-app-subtle motion-safe:animate-pulse"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  )
}

export type QuickAction = { label: string; href: string }

/**
 * Shortcuts to somewhere that exists.
 *
 * These used to be buttons with no handler — things that looked clickable and
 * silently were not. A shortcut that goes nowhere is worse than no shortcut, so
 * this takes destinations, and anything without one is simply not offered.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="rounded-full border border-app-border bg-app-panel px-4 py-2 text-[0.85rem] font-medium text-app-ink transition-colors hover:border-app-muted/50 hover:bg-app-subtle"
        >
          {a.label}
        </Link>
      ))}
    </nav>
  )
}
