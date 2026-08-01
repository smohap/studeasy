'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { EASE } from '@/lib/motion'

const LINKS = [
  { label: 'Courses', href: '/courses' },
  { label: 'Subjects', href: '#subjects' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#book' },
  { label: 'Results', href: '#results' },
]

/** Auth state is resolved on the server and passed down, so the nav never flickers. */
export default function Nav({
  signedIn,
  portalHref,
}: {
  signedIn: boolean
  portalHref: string
}) {
  const [open, setOpen] = useState(false)
  const [lifted, setLifted] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (v) => setLifted(v > 24))

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        lifted || open
          ? 'border-b border-hairline bg-base/85 backdrop-blur-xl'
          : 'border-b border-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8"
      >
        <a
          href="#top"
          className="text-[1.05rem] font-extrabold tracking-tight text-ink uppercase"
        >
          Stud<span className="text-accent">Easy</span>
        </a>

        <ul className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href={portalHref}
            className="hidden px-3 text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink lg:inline-block"
          >
            {signedIn ? 'My portal' : 'Sign in'}
          </Link>
          <a
            href="#book"
            className="hidden rounded-full bg-accent px-5 py-2.5 text-[0.85rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.03] sm:inline-block"
          >
            Book a free session
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink lg:hidden"
          >
            {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-hairline bg-base px-5 pb-6 pt-2 lg:hidden"
      >
        <ul className="flex flex-col">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-b border-hairline py-3.5 text-lg font-light text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <Link
              href={portalHref}
              onClick={() => setOpen(false)}
              className="block border-b border-hairline py-3.5 text-lg font-light text-ink"
            >
              {signedIn ? 'My portal' : 'Sign in'}
            </Link>
          </li>
          <li>
            <a
              href="#book"
              onClick={() => setOpen(false)}
              className="mt-5 block rounded-full bg-accent px-5 py-3 text-center text-[0.95rem] font-medium text-[#100c00]"
            >
              Book a free session
            </a>
          </li>
        </ul>
      </div>
    </motion.header>
  )
}
