'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { EASE } from '@/lib/motion'

/**
 * The public site header.
 *
 * Every href is an absolute path, including the two that point at sections of
 * the home page. The nav used to carry bare `#subjects` fragments, which work
 * only while you are already on `/` — from /about they scrolled the About page
 * to nothing. `/#book` navigates and then jumps, from anywhere.
 */
export const SITE_LINKS = [
  { label: 'Subjects', href: '/subjects' },
  { label: 'Courses', href: '/courses' },
  { label: 'Tutors', href: '/tutors' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Results', href: '/success-stories' },
  { label: 'Resources', href: '/resources' },
  { label: 'About', href: '/about' },
]

export default function SiteNav({
  signedIn,
  portalHref,
}: {
  signedIn: boolean
  portalHref: string
}) {
  const [open, setOpen] = useState(false)
  // The home page has a transparent nav over its hero; every other page starts
  // scrolled to the top of ordinary content and needs the rule from the outset.
  const isHome = usePathname() === '/'
  const [lifted, setLifted] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (v) => setLifted(v > 24))

  const solid = !isHome || lifted || open

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid
          ? 'border-b border-hairline bg-base/85 backdrop-blur-xl'
          : 'border-b border-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8"
      >
        <Link
          href="/"
          className="text-[1.05rem] font-extrabold tracking-tight text-ink uppercase"
        >
          Stud<span className="text-accent">Easy</span>
        </Link>

        <ul className="hidden items-center gap-6 xl:flex">
          {SITE_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
              >
                {l.label}
              </Link>
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
          <Link
            href="/#book"
            className="hidden rounded-full bg-accent px-5 py-2.5 text-[0.85rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.03] sm:inline-block"
          >
            Book a free session
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink xl:hidden"
          >
            {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </nav>

      <div
        id="site-menu"
        hidden={!open}
        className="max-h-[70vh] overflow-y-auto border-t border-hairline bg-base px-5 pb-6 pt-2 xl:hidden"
      >
        <ul className="flex flex-col">
          {SITE_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-b border-hairline py-3.5 text-lg font-light text-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
          {[
            { label: 'Success stories', href: '/success-stories' },
            { label: 'Blog', href: '/blog' },
            { label: 'FAQ', href: '/faq' },
            { label: 'Contact', href: '/contact' },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-b border-hairline py-3.5 text-lg font-light text-ink"
              >
                {l.label}
              </Link>
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
            <Link
              href="/#book"
              onClick={() => setOpen(false)}
              className="mt-5 block rounded-full bg-accent px-5 py-3 text-center text-[0.95rem] font-medium text-[#100c00]"
            >
              Book a free session
            </Link>
          </li>
        </ul>
      </div>
    </motion.header>
  )
}
