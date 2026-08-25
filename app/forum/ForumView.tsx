'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, MessageSquare, Plus } from 'lucide-react'
import type { ForumTopic } from '@/lib/class-types'
import { postTopic } from '@/app/portal/class-actions'

/** Tutors and admins are labelled so an answer's weight is obvious at a glance. */
function RoleBadge({ role }: { role: string | null | undefined }) {
  if (role !== 'tutor' && role !== 'admin') return null
  return (
    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.7rem] font-medium text-accent">
      {role === 'tutor' ? 'Tutor' : 'StudEasy'}
    </span>
  )
}

export default function ForumView({
  topics,
  subjects,
  signedIn,
}: {
  topics: ForumTopic[]
  subjects: string[]
  signedIn: boolean
}) {
  const [asking, setAsking] = useState(false)

  return (
    <>
      {signedIn ? (
        asking ? (
          <AskForm subjects={subjects} onDone={() => setAsking(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[0.92rem] font-medium text-[#100c00]"
          >
            <Plus size={16} aria-hidden />
            Ask a question
          </button>
        )
      ) : (
        <Link
          href="/sign-in"
          className="mt-8 inline-block rounded-full bg-accent px-6 py-3 text-[0.92rem] font-medium text-[#100c00]"
        >
          Sign in to ask a question
        </Link>
      )}

      {topics.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
          <p className="text-[1rem] font-medium text-ink">No questions yet</p>
          <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed font-light text-ink-dim">
            Be the first. Someone else is almost certainly stuck on the same thing.
          </p>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-3">
          {topics.map((t) => (
            <li key={t.id} className="rounded-2xl border border-hairline bg-base-raised p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-[1.02rem] leading-snug font-medium text-ink">
                  <Link href={`/forum/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>
                </h2>
                {t.status === 'answered' && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[0.75rem] font-medium text-accent">
                    <CheckCircle2 size={13} aria-hidden />
                    Answered
                  </span>
                )}
              </div>

              <p className="mt-2 line-clamp-2 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                {t.body}
              </p>

              <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.82rem] font-light text-ink-dim">
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare size={13} aria-hidden />
                  {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}
                </span>
                <span aria-hidden>·</span>
                <span>{t.author_name}</span>
                <RoleBadge role={t.author_role} />
                {t.subject && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-accent">{t.subject}</span>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function AskForm({ subjects, onDone }: { subjects: string[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const input =
    'w-full rounded-xl border border-hairline bg-base-raised px-5 py-3 text-[0.95rem] font-light text-ink placeholder:text-white/30'

  return (
    <form
      className="mt-8 flex flex-col gap-3 rounded-2xl border border-hairline bg-base-raised p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const res = await postTopic({ title, body, subject })
          if (res.error) setError(res.error)
          else onDone()
        })
      }}
    >
      <label htmlFor="t-title" className="text-[0.82rem] font-medium text-ink-dim">
        Your question
      </label>
      <input
        id="t-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Why does the derivative of sin(x) turn into cos(x)?"
        className={input}
      />

      <label htmlFor="t-body" className="mt-2 text-[0.82rem] font-medium text-ink-dim">
        Details
      </label>
      <textarea
        id="t-body"
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Show what you have tried and where it stops making sense. You will get a better answer."
        className={input}
      />

      <label htmlFor="t-subject" className="mt-2 text-[0.82rem] font-medium text-ink-dim">
        Subject
      </label>
      <select
        id="t-subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className={input}
      >
        <option value="">Not sure</option>
        {subjects.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="text-[0.87rem] text-red-400">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-60"
        >
          {pending ? 'Posting…' : 'Post question'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
