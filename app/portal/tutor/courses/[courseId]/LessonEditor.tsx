'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createLesson, removeLesson } from '@/app/portal/lesson-actions'
import { CONTENT_TYPES, type ContentType, type Lesson } from '@/lib/lesson-types'
import { EmptyState, Panel } from '@/components/app/Ui'

export default function LessonEditor({
  courseId,
  lessons,
}: {
  courseId: string
  lessons: Lesson[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contentType, setContentType] = useState<ContentType>('text')
  const [externalUrl, setExternalUrl] = useState('')
  const [body, setBody] = useState('')
  const [duration, setDuration] = useState('')
  const [isPreview, setIsPreview] = useState(false)

  const needsUrl = ['youtube', 'video', 'link', 'pdf', 'slides', 'image', 'document'].includes(
    contentType,
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    start(async () => {
      const result = await createLesson({
        courseId,
        title,
        description,
        contentType,
        externalUrl,
        body,
        durationMinutes: duration,
        isPreview,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setTitle('')
      setDescription('')
      setExternalUrl('')
      setBody('')
      setDuration('')
      setIsPreview(false)
      setSaved(true)
      router.refresh()
    })
  }

  function remove(id: string) {
    start(async () => {
      const result = await removeLesson(id, courseId)
      if (result.error) setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Lessons" subtitle="Students work through these in order.">
        {lessons.length === 0 ? (
          <EmptyState
            title="No lessons yet"
            body="Add the first one below. Until a course has lessons, an enrolled student has nothing to open."
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {lessons.map((l, i) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-subtle text-[0.75rem] font-semibold"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.94rem] font-medium">{l.title}</p>
                    <p className="mt-0.5 text-[0.83rem] font-light text-app-muted">
                      {CONTENT_TYPES.find((t) => t.value === l.content_type)?.label ??
                        l.content_type}
                      {l.duration_minutes ? ` · ${l.duration_minutes} min` : ''}
                      {l.is_preview ? ' · free preview' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  disabled={pending}
                  className="grid h-9 w-9 place-items-center rounded-full border border-app-border text-app-muted hover:border-app-bad hover:text-app-bad disabled:opacity-50"
                >
                  <span className="sr-only">Remove {l.title}</span>
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Add a lesson">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label htmlFor="l-title" className={labelClass}>
              Title
            </label>
            <input
              id="l-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Factorising quadratics"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="l-desc" className={labelClass}>
              What this covers
            </label>
            <input
              id="l-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line, so a student knows whether to open it."
              className={inputClass}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="l-type" className={labelClass}>
                Content type
              </label>
              <select
                id="l-type"
                value={contentType}
                onChange={(e) => setContentType(e.target.value as ContentType)}
                className={inputClass}
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="l-mins" className={labelClass}>
                Minutes (optional)
              </label>
              <input
                id="l-mins"
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="12"
                className={inputClass}
              />
            </div>
          </div>

          {contentType === 'text' ? (
            <div>
              <label htmlFor="l-body" className={labelClass}>
                Notes
              </label>
              <textarea
                id="l-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the lesson. Blank lines become paragraphs."
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="l-url" className={labelClass}>
                Link
              </label>
              <input
                id="l-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className={inputClass}
              />
              <p className="mt-2 text-[0.8rem] leading-relaxed font-light text-app-muted">
                {needsUrl && contentType !== 'youtube' && contentType !== 'video'
                  ? 'File upload to storage is not wired up yet — paste a link for now.'
                  : 'Paste the video URL. YouTube links are embedded automatically.'}
              </p>
            </div>
          )}

          <label className="flex items-center gap-3 text-[0.9rem] font-light text-app-ink">
            <input
              type="checkbox"
              checked={isPreview}
              onChange={(e) => setIsPreview(e.target.checked)}
              className="h-4 w-4 accent-[#E3B341]"
            />
            Free preview — anyone can open this without enrolling
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-50"
            >
              {pending ? 'Adding…' : 'Add lesson'}
            </button>
            {saved && (
              <span role="status" className="text-[0.86rem] font-medium text-app-good">
                Lesson added
              </span>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[0.88rem] font-light text-app-bad">
              {error}
            </p>
          )}
        </form>
      </Panel>
    </div>
  )
}

const labelClass =
  'mb-2 block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase'
const inputClass =
  'w-full rounded-xl border border-app-border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted'
