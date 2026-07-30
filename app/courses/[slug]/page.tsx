import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Star } from 'lucide-react'
import { getCourse, getShopHeader } from '@/lib/shop-data'
import { FORMAT_LABEL, KIND_LABEL, formatPrice } from '@/lib/catalog'
import ShopNav from '@/components/shop/ShopNav'
import AddToCartButton from '@/components/shop/AddToCartButton'
import Footer from '@/components/Footer'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const course = await getCourse(slug)
  if (!course) return { title: 'Course not found — StudEasy' }

  return {
    title: `${course.title} — StudEasy`,
    description: course.summary ?? undefined,
  }
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [header, course] = await Promise.all([getShopHeader(), getCourse(slug)])

  if (!course) notFound()

  const facts = [
    { label: 'Type', value: KIND_LABEL[course.kind] },
    { label: 'Format', value: FORMAT_LABEL[course.format] },
    { label: 'Subject', value: course.subject },
    { label: 'Level', value: course.level ?? 'All levels' },
    { label: 'Seats', value: course.seats == null ? 'Unlimited' : `${course.seats} left` },
  ]

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden />
          All courses
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <span aria-hidden className="text-[2.4rem]">
              {course.emoji ?? '📘'}
            </span>
            <p className="mt-4 text-[0.76rem] font-medium tracking-[0.16em] text-ink-dim uppercase">
              {course.subject}
              {course.level ? ` · ${course.level}` : ''}
            </p>
            <h1 className="mt-3 text-[clamp(1.9rem,5vw,3rem)] leading-tight font-extrabold tracking-tight text-ink">
              {course.title}
            </h1>

            <p className="mt-4 text-[0.95rem] font-light text-ink-dim">
              Taught by <span className="text-ink">{course.teacher_name}</span>
              {course.rating_avg != null && (
                <>
                  {' · '}
                  <span className="inline-flex items-center gap-1 text-accent">
                    <Star size={13} aria-hidden fill="currentColor" />
                    {course.rating_avg}
                  </span>
                  <span aria-hidden> ({course.rating_count} reviews)</span>
                  <span className="sr-only">
                    {' '}
                    out of 5, from {course.rating_count} reviews
                  </span>
                </>
              )}
            </p>

            {course.summary && (
              <p className="mt-8 text-[1.1rem] leading-relaxed font-light text-ink">
                {course.summary}
              </p>
            )}

            {course.description && (
              <p className="mt-5 text-[0.98rem] leading-relaxed font-light text-ink-dim">
                {course.description}
              </p>
            )}

            <dl className="mt-10 grid grid-cols-2 gap-4 border-t border-hairline pt-8 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
                    {f.label}
                  </dt>
                  <dd className="mt-1.5 text-[0.98rem] font-light text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-hairline bg-base-raised p-6">
              <p className="text-[2rem] leading-none font-semibold tracking-tight text-ink">
                {formatPrice(course.price_cents, course.currency)}
              </p>
              <p className="mt-2 text-[0.86rem] font-light text-ink-dim">
                {course.price_cents === 0
                  ? 'No charge, no obligation.'
                  : 'One payment. Includes every session and all materials.'}
              </p>

              <div className="mt-6">
                <AddToCartButton
                  courseId={course.id}
                  free={course.price_cents === 0}
                  signedIn={header.signedIn}
                  wide
                />
              </div>

              <p className="mt-4 text-[0.8rem] leading-relaxed font-light text-ink-dim">
                Every AI feature on this course is grounded in this teacher&rsquo;s own
                worksheets, not a general-purpose model.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </>
  )
}
