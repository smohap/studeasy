import { ROLE_LABEL, type Role } from '@/lib/roles'
import type { ReactNode } from 'react'

export function PortalHeader({
  role,
  name,
  blurb,
}: {
  role: Role
  name?: string | null
  blurb: string
}) {
  const first = name?.split(' ')[0]
  return (
    <>
      <p className="text-[0.8rem] font-medium tracking-[0.2em] text-accent uppercase">
        {ROLE_LABEL[role]} portal
      </p>
      <h1 className="display text-gradient mt-4 text-[clamp(2.2rem,7vw,4.5rem)]">
        {first ? `Kia ora, ${first}` : ROLE_LABEL[role]}
      </h1>
      <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
        {blurb}
      </p>
    </>
  )
}

/**
 * The honest bit: these portals have no features yet, so each one names what
 * it owes its user rather than showing mock data that reads as working.
 */
export function NotBuiltYet({ items }: { items: string[] }) {
  return (
    <section
      aria-labelledby="planned-heading"
      className="mt-12 rounded-3xl border border-hairline bg-base-raised p-7 sm:p-9"
    >
      <h2 id="planned-heading" className="text-[1.1rem] font-semibold tracking-tight text-ink">
        Not built yet
      </h2>
      <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed font-light text-ink-dim">
        Your account works and your role is set. These are the features this portal still
        owes you:
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[0.94rem] leading-relaxed font-light text-ink">
            <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Panel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-8 rounded-3xl border border-hairline bg-base-raised p-7 sm:p-9">
      <h2 className="text-[1.1rem] font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}
