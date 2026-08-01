import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getCourseWithLessons } from '@/lib/lessons'
import { getShopHeader } from '@/lib/shop-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'
import LessonPlayer from './LessonPlayer'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { course } = await getCourseWithLessons(slug)
  return {
    title: course ? `${course.title} — StudEasy` : 'Course — StudEasy',
    robots: { index: false },
  }
}

export default async function LearnPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [header, data] = await Promise.all([
    getShopHeader(),
    getCourseWithLessons(slug),
  ])

  if (!data.course) notFound()

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href={`/courses/${data.course.slug}`}
          className="inline-flex items-center gap-2 text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden />
          Course details
        </Link>

        <h1 className="mt-6 text-[clamp(1.7rem,4.5vw,2.6rem)] leading-tight font-extrabold tracking-tight text-ink">
          {data.course.title}
        </h1>
        <p className="mt-2 text-[0.95rem] font-light text-ink-dim">
          {data.course.teacher_name}
          {!data.enrolled && ' · you are not enrolled, so only preview lessons are open'}
        </p>

        <div className="mt-10">
          <LessonPlayer
            course={data.course}
            lessons={data.lessons}
            enrolled={data.enrolled}
            completedIds={data.completedIds}
          />
        </div>
      </main>

      <Footer />
    </>
  )
}
