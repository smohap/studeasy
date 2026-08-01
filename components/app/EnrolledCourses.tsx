import Link from 'next/link'
import type { Course } from '@/lib/catalog'
import { FORMAT_LABEL, formatPrice } from '@/lib/catalog'
import { EmptyState, Panel } from './Ui'

export type Enrolment = {
  id: string
  status: string
  progress_pct: number
  course: Course
}

/** The student's real enrolments, from the catalog — not fixtures. */
export default function EnrolledCourses({ enrolments }: { enrolments: Enrolment[] }) {
  return (
    <Panel
      title="My courses"
      subtitle="Courses you are enrolled in. This is live account data."
      actions={
        <Link
          href="/courses"
          className="rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-medium hover:bg-app-subtle"
        >
          Browse catalog
        </Link>
      }
    >
      {enrolments.length === 0 ? (
        <EmptyState
          title="You are not enrolled in anything yet"
          body="Browse the catalog and enrol in a course, or start with the free diagnostic assessment."
          action={
            <Link
              href="/courses"
              className="inline-block rounded-full bg-accent px-6 py-3 text-[0.88rem] font-medium text-[#100c00]"
            >
              Browse courses
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {enrolments.map((e) => (
            <li key={e.id} className="rounded-xl border border-app-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="text-[1.3rem]">
                    {e.course.emoji ?? '📘'}
                  </span>
                  <div>
                    <Link
                      href={`/courses/${e.course.slug}`}
                      className="text-[0.95rem] font-medium hover:underline"
                    >
                      {e.course.title}
                    </Link>
                    <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                      {e.course.teacher_name} · {FORMAT_LABEL[e.course.format]} ·{' '}
                      {formatPrice(e.course.price_cents, e.course.currency)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[0.84rem] font-medium text-app-muted">
                    {e.progress_pct}% complete
                  </span>
                  <Link
                    href={`/learn/${e.course.slug}`}
                    className="rounded-full bg-accent px-4 py-2 text-[0.84rem] font-medium text-[#100c00]"
                  >
                    {e.progress_pct > 0 ? 'Continue' : 'Start'}
                  </Link>
                </div>
              </div>

              <div
                role="img"
                aria-label={`${e.course.title}: ${e.progress_pct} percent complete`}
                className="mt-3 h-2 overflow-hidden rounded-full bg-app-subtle"
              >
                <span
                  className="block h-full rounded-full bg-accent-deep"
                  style={{ width: `${e.progress_pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
