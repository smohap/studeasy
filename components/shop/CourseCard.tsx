import Link from 'next/link'
import { Star } from 'lucide-react'
import { FORMAT_LABEL, KIND_LABEL, formatPrice, type Course } from '@/lib/catalog'
import AddToCartButton from './AddToCartButton'

export default function CourseCard({
  course,
  signedIn,
}: {
  course: Course
  signedIn: boolean
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-base-raised transition-colors hover:border-ink/25">
      <Link
        href={`/courses/${course.slug}`}
        className="flex flex-1 flex-col p-6 focus-visible:outline-offset-4"
      >
        <span aria-hidden className="text-[1.8rem]">
          {course.emoji ?? '📘'}
        </span>

        <p className="mt-4 text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
          {course.subject}
          {course.level ? ` · ${course.level}` : ''}
        </p>

        <h3 className="mt-2 text-[1.1rem] leading-snug font-semibold tracking-tight text-ink">
          {course.title}
        </h3>

        {course.summary && (
          <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
            {course.summary}
          </p>
        )}

        <p className="mt-4 text-[0.85rem] font-light text-ink-dim">
          {course.teacher_name}
          {course.rating_avg != null && (
            <>
              {' · '}
              <span className="inline-flex items-center gap-1 text-accent">
                <Star size={12} aria-hidden fill="currentColor" />
                {course.rating_avg}
              </span>
              <span className="sr-only">
                {' '}
                out of 5, from {course.rating_count} reviews
              </span>
              <span aria-hidden> ({course.rating_count})</span>
            </>
          )}
        </p>
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-hairline px-6 py-4">
        <div>
          <p className="text-[1.05rem] font-semibold text-ink">
            {formatPrice(course.price_cents, course.currency)}
          </p>
          <p className="text-[0.76rem] font-light text-ink-dim">
            {KIND_LABEL[course.kind]} · {FORMAT_LABEL[course.format]}
          </p>
        </div>
        <AddToCartButton
          courseId={course.id}
          free={course.price_cents === 0}
          signedIn={signedIn}
        />
      </div>
    </article>
  )
}
