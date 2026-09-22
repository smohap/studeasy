import Link from 'next/link'
import type { ReactNode } from 'react'

/** The handful of pieces the public pages are built from, on the dark palette. */

export function Section({
  id,
  title,
  lead,
  children,
  className = '',
}: {
  id?: string
  title?: string
  lead?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={id && title ? `${id}-h` : undefined}
      className={`mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 ${className}`}
    >
      {title && (
        <h2
          id={id ? `${id}-h` : undefined}
          className="text-[clamp(1.6rem,4vw,2.6rem)] font-semibold tracking-tight text-ink"
        >
          {title}
        </h2>
      )}
      {lead && (
        <p className="mt-4 max-w-3xl text-[1.02rem] leading-relaxed font-light text-ink-dim">
          {lead}
        </p>
      )}
      <div className={title || lead ? 'mt-10' : ''}>{children}</div>
    </section>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-hairline bg-base-raised p-6 sm:p-7 ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * What a page shows when the query came back with nothing.
 *
 * It always says which thing is empty and what would fill it. "Nothing here"
 * on its own leaves a reader unable to tell a new platform from a broken page.
 */
export function Empty({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
      <p className="text-[1.05rem] font-normal text-ink">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-relaxed font-light text-ink-dim">
        {body}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-7 inline-block rounded-full border border-hairline px-5 py-2.5 text-[0.88rem] font-light text-ink transition-colors hover:border-ink/40"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-hairline px-3 py-1 text-[0.78rem] font-light text-ink-dim">
      {children}
    </span>
  )
}

/**
 * A figure with its label. `value` is a string so the caller decides how a
 * missing number reads — every one of these passes an em dash rather than 0
 * when there is no data, because a zero here is a claim.
 */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-base-raised p-5 sm:p-6">
      <p className="text-[clamp(1.5rem,3.2vw,2.2rem)] font-semibold tracking-tight text-accent">
        {value}
      </p>
      <p className="mt-2 text-[0.85rem] leading-snug font-light text-ink-dim">{label}</p>
    </div>
  )
}

export function Cta({
  title,
  body,
  primary,
  secondary,
}: {
  title: string
  body: string
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <div className="rounded-3xl border border-hairline bg-base-raised px-6 py-12 text-center sm:px-12 sm:py-16">
        <h2 className="text-[clamp(1.6rem,4vw,2.6rem)] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[1rem] leading-relaxed font-light text-ink-dim">
          {body}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={primary.href}
            className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.03]"
          >
            {primary.label}
          </Link>
          {secondary && (
            <Link
              href={secondary.href}
              className="rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink transition-colors hover:border-ink/40"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
