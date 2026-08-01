'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { submitReview } from '@/app/portal/lesson-actions'
import type { Review } from '@/lib/lesson-types'

export default function Reviews({
  courseId,
  courseSlug,
  reviews,
  canReview,
}: {
  courseId: string
  courseSlug: string
  reviews: Review[]
  /** Only an enrolled student sees the form; the database enforces it too. */
  canReview: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (rating === 0) {
      setError('Pick a rating first.')
      return
    }
    start(async () => {
      const result = await submitReview(courseId, courseSlug, rating, body)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone(true)
      setBody('')
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="reviews-heading" className="mt-14 border-t border-hairline pt-10">
      <h2 id="reviews-heading" className="text-[1.3rem] font-semibold tracking-tight text-ink">
        Reviews
      </h2>

      {canReview && !done && (
        <form onSubmit={submit} className="mt-6 rounded-2xl border border-hairline bg-base-raised p-6">
          <fieldset>
            <legend className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
              Your rating
            </legend>
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-pressed={rating === n}
                  className="rounded-full p-1.5 transition-colors hover:bg-white/5"
                >
                  <span className="sr-only">{n} out of 5</span>
                  <Star
                    size={22}
                    aria-hidden
                    className={n <= rating ? 'text-accent' : 'text-ink-dim'}
                    fill={n <= rating ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="review-body" className="sr-only">
            Your review
          </label>
          <textarea
            id="review-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What was useful, and what would you tell someone considering it?"
            className="mt-5 w-full rounded-xl border border-hairline bg-base px-4 py-3 text-[0.94rem] font-light text-ink placeholder:text-white/30"
          />

          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-50"
          >
            {pending ? 'Posting…' : 'Post review'}
          </button>

          {error && (
            <p role="alert" className="mt-3 text-[0.88rem] font-light text-[#F0A0A0]">
              {error}
            </p>
          )}
        </form>
      )}

      {done && (
        <p role="status" className="mt-6 text-[0.94rem] font-light text-ink">
          Thanks — your review is live.
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="mt-6 text-[0.94rem] leading-relaxed font-light text-ink-dim">
          No reviews yet. Reviews can only be left by people who took the course.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-hairline pb-5 last:border-0">
              <div className="flex items-center gap-3">
                <span className="flex" aria-label={`${r.rating} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={13}
                      aria-hidden
                      className={n <= r.rating ? 'text-accent' : 'text-ink-dim'}
                      fill={n <= r.rating ? 'currentColor' : 'none'}
                    />
                  ))}
                </span>
                <span className="text-[0.88rem] font-medium text-ink">
                  {r.student?.full_name ?? 'Student'}
                </span>
              </div>
              {r.body && (
                <p className="mt-2 text-[0.94rem] leading-relaxed font-light text-ink-dim">
                  {r.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
