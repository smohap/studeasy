import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'

/**
 * Header for the public catalog. Deliberately plainer than the marketing site's
 * animated nav — this is a browsing surface, not a pitch.
 */
export default function ShopNav({
  cartCount,
  signedIn,
  portalHref,
}: {
  cartCount: number
  signedIn: boolean
  portalHref: string
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-base/90 backdrop-blur-xl">
      <nav
        aria-label="Catalog"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8"
      >
        <div className="flex items-baseline gap-6">
          <Link
            href="/"
            className="text-[1.05rem] font-extrabold tracking-tight text-ink uppercase"
          >
            Stud<span className="text-accent">Easy</span>
          </Link>
          {[
            { href: '/courses', label: 'Courses' },
            { href: '/classes', label: 'Live classes' },
            { href: '/forum', label: 'Forum' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink sm:inline"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href={portalHref}
            className="text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
          >
            {signedIn ? 'My portal' : 'Sign in'}
          </Link>
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[0.86rem] font-light text-ink transition-colors hover:border-ink/40"
          >
            <ShoppingCart size={15} aria-hidden />
            Cart
            <span className="sr-only">, {cartCount} items</span>
            <span
              aria-hidden
              className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.72rem] font-semibold ${
                cartCount > 0 ? 'bg-accent text-[#100c00]' : 'bg-white/10 text-ink-dim'
              }`}
            >
              {cartCount}
            </span>
          </Link>
        </div>
      </nav>
    </header>
  )
}
