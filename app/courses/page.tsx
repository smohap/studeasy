import type { Metadata } from 'next'
import Link from 'next/link'
import { getShopHeader, listCourses } from '@/lib/shop-data'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import ShopNav from '@/components/shop/ShopNav'
import CourseCard from '@/components/shop/CourseCard'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Courses — StudEasy',
  description:
    'Browse NCEA and Cambridge Maths and Science courses, classes and assessments taught by real teachers.',
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string }>
}) {
  const { q, subject } = await searchParams
  const [header, courses] = await Promise.all([
    getShopHeader(),
    listCourses({ q, subject }),
  ])

  const activeSubject = subject ?? 'All subjects'

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-gradient display text-[clamp(2.4rem,8vw,5rem)]">Courses</h1>
        <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
          Taught by real teachers, marked overnight. Book a whole course, a single class,
          or the free diagnostic first.
        </p>

        {/* GET form so a search is a real URL — shareable, and it works without JS. */}
        <form method="get" className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="q" className="sr-only">
              Search courses, teachers or subjects
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Search courses, teachers, subjects…"
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
            const href = params.toString() ? `/courses?${params}` : '/courses'
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
          {courses.length === 0
            ? 'No courses match that.'
            : `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`}
        </p>

        {courses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
            <p className="text-[1rem] font-medium text-ink">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Either the catalog is still being set up, or that search was too narrow. Try
              clearing the filters.
            </p>
            <Link
              href="/courses"
              className="mt-6 inline-block rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink"
            >
              Show everything
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} signedIn={header.signedIn} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </>
  )
}
