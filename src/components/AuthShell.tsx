import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/** Shared frame for the sign-in and role-selection pages. */
export default function AuthShell({
  title,
  lede,
  children,
}: {
  title: string
  lede?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-svh px-5 py-10 sm:px-8">
      <Link
        to="/"
        className="inline-block text-[1.05rem] font-extrabold tracking-tight text-ink uppercase"
      >
        Stud<span className="text-accent">Easy</span>
      </Link>

      <main className="mx-auto mt-16 max-w-xl pb-24">
        <h1 className="display text-gradient text-[clamp(2.2rem,6vw,3.6rem)]">{title}</h1>
        {lede && (
          <p className="mt-5 text-[1rem] leading-relaxed font-light text-ink-dim">{lede}</p>
        )}
        <div className="mt-10">{children}</div>
      </main>
    </div>
  )
}
