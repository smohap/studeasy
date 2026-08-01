import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getLessonsForTeacher } from '@/lib/lessons'
import { STATUS_LABEL, formatPrice } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'
import LessonEditor from './LessonEditor'

export const metadata = { title: 'Course content — StudEasy', robots: { index: false } }

export default async function CourseContentPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Catalog not configured"
        body="Add the Supabase environment variables to manage course content."
      />
    )
  }

  const { course, lessons } = await getLessonsForTeacher(courseId)
  if (!course) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/tutor/courses"
          className="inline-flex items-center gap-2 text-[0.88rem] font-light text-app-muted transition-colors hover:text-app-ink"
        >
          <ArrowLeft size={15} aria-hidden />
          Course studio
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
              {course.title}
            </h1>
            <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
              {course.subject}
              {course.level ? ` · ${course.level}` : ''} ·{' '}
              {formatPrice(course.price_cents, course.currency)} ·{' '}
              {STATUS_LABEL[course.status]}
            </p>
          </div>

          {course.status === 'published' && (
            <Link
              href={`/learn/${course.slug}`}
              className="inline-flex items-center gap-2 rounded-full border border-app-border px-5 py-2.5 text-[0.86rem] font-medium hover:bg-app-subtle"
            >
              See it as a student
              <ExternalLink size={14} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      <LessonEditor courseId={course.id} lessons={lessons} />
    </div>
  )
}
