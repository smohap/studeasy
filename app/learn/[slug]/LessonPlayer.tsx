'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, FileText, Link2, Lock, Play } from 'lucide-react'
import { completeLesson } from '@/app/portal/lesson-actions'
import type { Lesson } from '@/lib/lesson-types'
import type { Course } from '@/lib/catalog'

/** Turns any YouTube URL shape into an embeddable one, or null if it is not one. */
function youtubeEmbed(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  )
  return match ? `https://www.youtube.com/embed/${match[1]}` : null
}

export default function LessonPlayer({
  course,
  lessons,
  enrolled,
  completedIds,
}: {
  course: Course
  lessons: Lesson[]
  enrolled: boolean
  completedIds: string[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [activeId, setActiveId] = useState(lessons[0]?.id ?? null)
  const [done, setDone] = useState<string[]>(completedIds)
  const [error, setError] = useState<string | null>(null)

  const active = lessons.find((l) => l.id === activeId) ?? null
  const locked = active ? !enrolled && !active.is_preview : false

  function markDone(lesson: Lesson) {
    setError(null)
    start(async () => {
      const result = await completeLesson(lesson.id, course.id, course.slug)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone((d) => (d.includes(lesson.id) ? d : [...d, lesson.id]))
      router.refresh()
    })
  }

  if (lessons.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline px-6 py-16 text-center">
        <p className="text-[1rem] font-medium text-ink">No lessons yet</p>
        <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed font-light text-ink-dim">
          {course.teacher_name} has not added content to this course yet. You will not lose
          access — everything added later appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* Contents */}
      <nav aria-label="Lessons" className="lg:sticky lg:top-24 lg:self-start">
        <p className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
          {done.length} of {lessons.length} done
        </p>
        <ol className="mt-4 flex flex-col gap-1">
          {lessons.map((l, i) => {
            const isDone = done.includes(l.id)
            const isLocked = !enrolled && !l.is_preview
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(l.id)}
                  aria-current={l.id === activeId ? 'true' : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    l.id === activeId
                      ? 'bg-base-raised text-ink'
                      : 'text-ink-dim hover:bg-base-raised/60'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold ${
                      isDone ? 'bg-accent text-[#100c00]' : 'border border-hairline'
                    }`}
                  >
                    {isDone ? <Check size={11} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9rem] leading-snug font-light">
                      {l.title}
                    </span>
                    <span className="mt-0.5 block text-[0.76rem] text-ink-dim">
                      {l.duration_minutes ? `${l.duration_minutes} min` : l.content_type}
                      {isDone ? ' · done' : ''}
                      {isLocked ? ' · locked' : ''}
                      {!enrolled && l.is_preview ? ' · free preview' : ''}
                    </span>
                  </span>
                  {isLocked && <Lock size={13} aria-hidden className="mt-1 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* The lesson itself */}
      <div>
        {active && (
          <article>
            <h2 className="text-[clamp(1.4rem,3.5vw,2rem)] leading-tight font-semibold tracking-tight text-ink">
              {active.title}
            </h2>
            {active.description && (
              <p className="mt-3 text-[0.98rem] leading-relaxed font-light text-ink-dim">
                {active.description}
              </p>
            )}

            <div className="mt-7">
              {locked ? (
                <div className="rounded-2xl border border-hairline bg-base-raised p-8 text-center">
                  <Lock size={22} aria-hidden className="mx-auto text-accent" />
                  <p className="mt-4 text-[1rem] font-medium text-ink">
                    Enrol to open this lesson
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-[0.92rem] leading-relaxed font-light text-ink-dim">
                    Preview lessons are free. The rest open as soon as you enrol.
                  </p>
                  <Link
                    href={`/courses/${course.slug}`}
                    className="mt-6 inline-block rounded-full bg-accent px-7 py-3 text-[0.92rem] font-medium text-[#100c00]"
                  >
                    See the course
                  </Link>
                </div>
              ) : (
                <LessonBody lesson={active} />
              )}
            </div>

            {!locked && (
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
                <button
                  type="button"
                  onClick={() => markDone(active)}
                  disabled={pending || done.includes(active.id)}
                  className={`rounded-full px-6 py-3 text-[0.9rem] font-medium ${
                    done.includes(active.id)
                      ? 'border border-hairline text-ink-dim'
                      : 'bg-accent text-[#100c00]'
                  } disabled:cursor-default`}
                >
                  {done.includes(active.id) ? 'Completed' : pending ? 'Saving…' : 'Mark as done'}
                </button>
                <span className="text-[0.84rem] font-light text-ink-dim">
                  {done.length} of {lessons.length} lessons complete
                </span>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 text-[0.88rem] font-light text-[#F0A0A0]">
                {error}
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  )
}

function LessonBody({ lesson }: { lesson: Lesson }) {
  if (lesson.content_type === 'text') {
    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-7">
        <p className="text-[1rem] leading-relaxed font-light whitespace-pre-line text-ink">
          {lesson.body}
        </p>
      </div>
    )
  }

  if (lesson.content_type === 'youtube' && lesson.external_url) {
    const embed = youtubeEmbed(lesson.external_url)
    if (embed) {
      return (
        <div className="aspect-video overflow-hidden rounded-2xl border border-hairline">
          <iframe
            src={embed}
            title={lesson.title}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )
    }
  }

  if (lesson.content_type === 'video' && lesson.external_url) {
    return (
      <video
        controls
        src={lesson.external_url}
        className="w-full rounded-2xl border border-hairline"
      >
        Your browser cannot play this video.
      </video>
    )
  }

  const href = lesson.external_url ?? lesson.storage_path
  const Icon = lesson.content_type === 'link' ? Link2 : FileText

  return (
    <div className="rounded-2xl border border-hairline bg-base-raised p-7">
      <Icon size={22} aria-hidden className="text-accent" />
      <p className="mt-4 text-[0.98rem] font-medium text-ink">
        {lesson.content_type === 'link' ? 'External resource' : 'Downloadable resource'}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-[0.88rem] font-light text-ink hover:border-ink/40"
        >
          <Play size={14} aria-hidden />
          Open
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <p className="mt-2 text-[0.9rem] font-light text-ink-dim">
          This resource has not been uploaded yet.
        </p>
      )}
    </div>
  )
}
