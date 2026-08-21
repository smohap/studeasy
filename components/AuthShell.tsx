import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { signOut } from '@/app/auth/actions'

/** Card frame shared by sign-in and registration. */
export default function AuthShell({
  title,
  lede,
  steps,
  currentStep,
  children,
  footer,
  exitSignsOut,
}: {
  title: string
  lede?: string
  /** Total steps in a wizard; omit for single-screen pages. */
  steps?: number
  currentStep?: number
  children: ReactNode
  footer?: ReactNode
  /**
   * Sign out on the way out instead of just navigating.
   *
   * Needed on the finish-registration screen: that account exists but has no
   * role, and the home page sends any signed-in account without a role back
   * here. A plain link would bounce straight back and trap them.
   */
  exitSignsOut?: boolean
}) {
  return (
    <div className="flex min-h-svh flex-col items-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-lg rounded-[28px] border border-hairline bg-base-raised p-6 sm:p-10">
        <div className="flex items-start justify-between gap-4">
          {exitSignsOut ? (
            <form action={signOut}>
              <button
                type="submit"
                className="text-[1.05rem] font-extrabold tracking-tight text-ink uppercase"
              >
                Stud<span className="text-accent">Easy</span>
              </button>
            </form>
          ) : (
            <Link
              href="/"
              className="text-[1.05rem] font-extrabold tracking-tight text-ink uppercase"
            >
              Stud<span className="text-accent">Easy</span>
            </Link>
          )}

          {exitSignsOut ? (
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-[0.85rem] font-light text-ink-dim transition-colors hover:text-ink"
              >
                <ArrowLeft size={15} aria-hidden />
                Back to home
              </button>
            </form>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[0.85rem] font-light text-ink-dim transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} aria-hidden />
              Back to home
            </Link>
          )}
        </div>

        {steps && currentStep != null && (
          <ol aria-label={`Step ${currentStep} of ${steps}`} className="mt-6 flex gap-2">
            {Array.from({ length: steps }, (_, i) => (
              <li
                key={i}
                aria-current={i + 1 === currentStep ? 'step' : undefined}
                className={`h-1.5 w-10 rounded-full transition-colors ${
                  i + 1 <= currentStep ? 'bg-accent' : 'bg-white/15'
                }`}
              >
                <span className="sr-only">
                  Step {i + 1}
                  {i + 1 === currentStep ? ' (current)' : ''}
                </span>
              </li>
            ))}
          </ol>
        )}

        <h1 className="mt-7 text-[clamp(1.9rem,5vw,2.6rem)] leading-[1.05] font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        {lede && (
          <p className="mt-3 text-[0.98rem] leading-relaxed font-light text-ink-dim">
            {lede}
          </p>
        )}

        <div className="mt-8">{children}</div>

        {footer && <div className="mt-8">{footer}</div>}

        <p className="mt-9 border-t border-hairline pt-6 text-center text-[0.78rem] font-light text-ink-dim">
          Terms · Privacy · © {new Date().getFullYear()} AIDO Technologies Ltd.
        </p>
      </div>
    </div>
  )
}
