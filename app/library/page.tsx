import type { Metadata } from 'next'
import Link from 'next/link'
import { getShopHeader } from '@/lib/shop-data'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { CONTENT_KIND_LABEL, listContent } from '@/lib/content-data'
import { formatMoney } from '@/lib/class-types'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Library — StudEasy',
  description:
    'Notes, worksheets and past papers written by StudEasy tutors. Some free, some paid.',
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string }>
}) {
  const { q, subject } = await searchParams
  const [header, items] = await Promise.all([getShopHeader(), listContent({ q, subject })])

  const activeSubject = subject ?? 'All subjects'

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-gradient display text-[clamp(2.4rem,8vw,5rem)]">Library</h1>
        <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
          Notes, worksheets and past papers written by the tutors who teach here. Some are
          free; the rest you buy once and keep.
        </p>

        <form method="get" className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="q" className="sr-only">
              Search the library
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Search notes, worksheets, authors…"
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
            const href = params.toString() ? `/library?${params}` : '/library'
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

        <p aria-live="polite" className="mt-8 text-[0.88rem] font-light text-ink-dim">
          {items.length === 0
            ? 'Nothing matches that.'
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        </p>

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
            <p className="text-[1rem] font-medium text-ink">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Either nothing has been published, or that search was too narrow.
            </p>
            <Link
              href="/library"
              className="mt-6 inline-block rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink"
            >
              Show everything
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col rounded-2xl border border-hairline bg-base-raised p-5"
              >
                <p className="text-[0.78rem] font-medium tracking-wide text-accent uppercase">
                  {CONTENT_KIND_LABEL[item.kind]}
                  {item.subject ? ` · ${item.subject}` : ''}
                </p>
                <h2 className="mt-2 text-[1.08rem] leading-snug font-semibold text-ink">
                  <Link href={`/library/${item.id}`} className="hover:underline">
                    {item.title}
                  </Link>
                </h2>
                <p className="mt-1 text-[0.85rem] font-light text-ink-dim">
                  by {item.author_name}
                  {item.year_level ? ` · ${item.year_level}` : ''}
                </p>

                {item.summary && (
                  <p className="mt-3 line-clamp-3 text-[0.88rem] leading-relaxed font-light text-ink-dim">
                    {item.summary}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-4">
                  <span className="text-[1rem] font-semibold text-ink">
                    {formatMoney(item.price_cents, item.currency)}
                  </span>
                  <Link
                    href={`/library/${item.id}`}
                    className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00]"
                  >
                    {item.price_cents === 0 ? 'Open' : 'View'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </>
  )
}
