import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, MapPin, Users, Video } from 'lucide-react'
import { getShopHeader } from '@/lib/shop-data'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { getClassCounts, listOpenClasses } from '@/lib/classes-data'
import { CLASS_MODE_LABEL, formatMoney, formatWhen } from '@/lib/class-types'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Live classes — StudEasy',
  description:
    'Small-group Maths and Science classes with a real teacher, online or in the classroom. Seats are limited and the waiting list is short.',
}

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string }>
}) {
  const { q, subject } = await searchParams
  const [header, classes] = await Promise.all([
    getShopHeader(),
    listOpenClasses({ q, subject }),
  ])

  // Seat counts drive the "nearly full" language, so they are worth the fan-out.
  const withCounts = await Promise.all(
    classes.map(async (session) => ({
      session,
      counts: await getClassCounts(session.id),
    })),
  )

  const activeSubject = subject ?? 'All subjects'

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-gradient display text-[clamp(2.4rem,8vw,5rem)]">Live classes</h1>
        <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
          Small groups, a set time, a real teacher. Seats are capped so everyone gets a
          turn — if a class is full you can take a place on the waiting list and move up
          when someone cancels.
        </p>

        <form method="get" className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="q" className="sr-only">
              Search classes, topics or teachers
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Search classes, topics, teachers…"
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
            const href = params.toString() ? `/classes?${params}` : '/classes'
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
          {withCounts.length === 0
            ? 'No classes match that.'
            : `${withCounts.length} ${withCounts.length === 1 ? 'class' : 'classes'}`}
        </p>

        {withCounts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
            <p className="text-[1rem] font-medium text-ink">Nothing scheduled yet</p>
            <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Either no classes are open for registration, or that search was too narrow.
            </p>
            <Link
              href="/classes"
              className="mt-6 inline-block rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink"
            >
              Show everything
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withCounts.map(({ session, counts }) => {
              const seatsLeft = Math.max(session.capacity - counts.taken, 0)
              const waitlistLeft = Math.max(session.waitlist_cap - counts.waitlisted, 0)

              return (
                <li
                  key={session.id}
                  className="flex flex-col rounded-2xl border border-hairline bg-base-raised p-5"
                >
                  <p className="text-[0.78rem] font-medium tracking-wide text-accent uppercase">
                    {session.subject}
                    {session.year_level ? ` · ${session.year_level}` : ''}
                  </p>
                  <h2 className="mt-2 text-[1.1rem] leading-snug font-semibold text-ink">
                    <Link href={`/classes/${session.id}`} className="hover:underline">
                      {session.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-[0.85rem] font-light text-ink-dim">
                    with {session.teacher_name}
                  </p>

                  <dl className="mt-4 flex flex-col gap-2 text-[0.85rem] font-light text-ink-dim">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={15} aria-hidden className="shrink-0 text-accent" />
                      <dt className="sr-only">When</dt>
                      <dd>{formatWhen(session.starts_at, session.ends_at)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.mode === 'classroom' ? (
                        <MapPin size={15} aria-hidden className="shrink-0 text-accent" />
                      ) : (
                        <Video size={15} aria-hidden className="shrink-0 text-accent" />
                      )}
                      <dt className="sr-only">Where</dt>
                      <dd>
                        {CLASS_MODE_LABEL[session.mode]}
                        {session.location ? ` · ${session.location}` : ''}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users size={15} aria-hidden className="shrink-0 text-accent" />
                      <dt className="sr-only">Seats</dt>
                      <dd>
                        {seatsLeft > 0
                          ? `${seatsLeft} of ${session.capacity} ${seatsLeft === 1 ? 'seat' : 'seats'} left`
                          : waitlistLeft > 0
                            ? `Full — ${waitlistLeft} waiting-list ${waitlistLeft === 1 ? 'place' : 'places'} left`
                            : 'Full, and the waiting list is closed'}
                      </dd>
                    </div>
                  </dl>

                  {session.topics && (
                    <p className="mt-4 line-clamp-3 text-[0.88rem] leading-relaxed font-light text-ink-dim">
                      {session.topics}
                    </p>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-4">
                    <span className="text-[1rem] font-semibold text-ink">
                      {formatMoney(session.price_cents, session.currency)}
                    </span>
                    <Link
                      href={`/classes/${session.id}`}
                      className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00]"
                    >
                      {seatsLeft > 0 ? 'Register' : 'See details'}
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      <Footer />
    </>
  )
}
