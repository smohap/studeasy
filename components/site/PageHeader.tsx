import type { ReactNode } from 'react'

/**
 * The opening block of a public page: an eyebrow, the display heading, and one
 * paragraph. Every public page uses it, so they share a vertical rhythm without
 * each one restating the type scale.
 */
export default function PageHeader({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string
  title: string
  intro?: string
  children?: ReactNode
}) {
  return (
    <header className="mx-auto max-w-6xl px-5 pt-10 pb-12 sm:px-8 sm:pt-16 sm:pb-16">
      <p className="text-[0.72rem] font-medium tracking-[0.2em] text-accent uppercase">
        {eyebrow}
      </p>
      <h1 className="text-gradient display mt-4 text-[clamp(2.6rem,9vw,6.5rem)]">
        {title}
      </h1>
      {intro && (
        <p className="mt-7 max-w-3xl text-[clamp(1.05rem,2.2vw,1.4rem)] leading-relaxed font-light text-ink-dim">
          {intro}
        </p>
      )}
      {children}
    </header>
  )
}
