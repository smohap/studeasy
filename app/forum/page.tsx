import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'
import { getShopHeader } from '@/lib/shop-data'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { listGeneralTopics } from '@/lib/classes-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'
import ForumView from './ForumView'

export const metadata: Metadata = {
  title: 'Help forum — StudEasy',
  description:
    'Ask a Maths or Science question and get an answer from other students, tutors and the StudEasy team.',
}

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string }>
}) {
  const { q, subject } = await searchParams
  const [header, { userId }, topics] = await Promise.all([
    getShopHeader(),
    getCurrentUser(),
    listGeneralTopics({ q, subject }),
  ])

  const activeSubject = subject ?? 'All subjects'
  const subjects = SUBJECT_FILTERS.filter((s) => s !== 'All subjects')

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-gradient display text-[clamp(2.4rem,8vw,5rem)]">Help forum</h1>
        <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
          Stuck on a problem? Ask here. Other students, tutors and the StudEasy team all
          answer — and the person who asked marks the reply that actually helped.
        </p>

        <form method="get" className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="q" className="sr-only">
              Search questions
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Search questions…"
              className="w-full rounded-full border border-hairline bg-base-raised px-6 py-3.5 text-[0.95rem] font-light text-ink placeholder:text-white/30"
            />
          </div>
          {activeSubject !== 'All subjects' && (
            <input type="hidden" name="subject" value={activeSubject} />
          )}
          <button
            type="submit"
            className="rounded-full bg-accent px-8 py-3.5 text-[0.92rem] font-medium text-[#100c00]"
          >
            Search
          </button>
        </form>

        <nav aria-label="Filter by subject" className="mt-6 flex flex-wrap gap-2">
          {SUBJECT_FILTERS.map((s) => {
            const params = new URLSearchParams()
            if (q) params.set('q', q)
            if (s !== 'All subjects') params.set('subject', s)
            const href = params.toString() ? `/forum?${params}` : '/forum'
            const on = s === activeSubject
            return (
              <Link
                key={s}
                href={href}
                aria-current={on ? 'true' : undefined}
                className={`rounded-full border px-4 py-2 text-[0.86rem] transition-colors ${
                  on
                    ? 'border-accent/60 bg-accent/15 font-normal text-accent'
                    : 'border-hairline font-light text-ink hover:border-ink/40'
                }`}
              >
                {s}
              </Link>
            )
          })}
        </nav>

        <ForumView topics={topics} subjects={subjects} signedIn={Boolean(userId)} />
      </main>

      <Footer />
    </>
  )
}
