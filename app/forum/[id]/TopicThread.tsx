'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Flag } from 'lucide-react'
import type { ForumReply, ForumTopic } from '@/lib/class-types'
import { acceptReply, postReply, reportPost } from '@/app/portal/class-actions'

function RoleBadge({ role }: { role: string | null | undefined }) {
  if (role !== 'tutor' && role !== 'admin') return null
  return (
    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.7rem] font-medium text-accent">
      {role === 'tutor' ? 'Tutor' : 'StudEasy'}
    </span>
  )
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function TopicThread({
  topic,
  replies,
  canAccept,
  signedIn,
}: {
  topic: ForumTopic
  replies: ForumReply[]
  /** The asker, the class teacher, or an admin. */
  canAccept: boolean
  signedIn: boolean
}) {
  // The accepted answer is lifted out and shown first — that is the whole point
  // of marking one.
  const accepted = replies.find((r) => r.id === topic.accepted_reply_id)
  const rest = replies.filter((r) => r.id !== topic.accepted_reply_id)

  return (
    <>
      <Link
        href={topic.class_id ? `/classes/${topic.class_id}` : '/forum'}
        className="text-[0.86rem] font-light text-ink-dim hover:text-ink"
      >
        ← {topic.class_id ? 'Back to the class' : 'Back to the forum'}
      </Link>

      <article className="mt-6">
        <h1 className="text-[clamp(1.6rem,4.5vw,2.4rem)] leading-[1.12] font-extrabold tracking-tight text-ink">
          {topic.title}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.85rem] font-light text-ink-dim">
          <span>{topic.author_name}</span>
          <RoleBadge role={topic.author_role} />
          <span aria-hidden>·</span>
          <span>{when(topic.created_at)}</span>
          {topic.subject && (
            <>
              <span aria-hidden>·</span>
              <span className="text-accent">{topic.subject}</span>
            </>
          )}
        </p>

        <p className="mt-6 leading-relaxed font-light whitespace-pre-line text-ink-dim">
          {topic.body}
        </p>

        <div className="mt-4">
          <ReportControl topicId={topic.id} signedIn={signedIn} />
        </div>
      </article>

      <section className="mt-12">
        <h2 className="text-[1.1rem] font-semibold text-ink">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </h2>

        <ul className="mt-5 flex flex-col gap-4">
          {accepted && (
            <ReplyCard
              key={accepted.id}
              reply={accepted}
              topicId={topic.id}
              isAccepted
              canAccept={false}
              signedIn={signedIn}
            />
          )}
          {rest.map((r) => (
            <ReplyCard
              key={r.id}
              reply={r}
              topicId={topic.id}
              isAccepted={false}
              canAccept={canAccept && !topic.accepted_reply_id}
              signedIn={signedIn}
            />
          ))}
        </ul>

        {replies.length === 0 && (
          <p className="mt-4 text-[0.92rem] leading-relaxed font-light text-ink-dim">
            No replies yet. If you know this one, help them out.
          </p>
        )}

        {signedIn ? (
          <ReplyForm topicId={topic.id} />
        ) : (
          <Link
            href="/sign-in"
            className="mt-8 inline-block rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00]"
          >
            Sign in to reply
          </Link>
        )}
      </section>
    </>
  )
}

function ReplyCard({
  reply,
  topicId,
  isAccepted,
  canAccept,
  signedIn,
}: {
  reply: ForumReply
  topicId: string
  isAccepted: boolean
  canAccept: boolean
  signedIn: boolean
}) {
  const [pending, start] = useTransition()

  return (
    <li
      className={`rounded-2xl border p-5 ${
        isAccepted ? 'border-accent/50 bg-accent/[0.06]' : 'border-hairline bg-base-raised'
      }`}
    >
      {isAccepted && (
        <p className="mb-3 inline-flex items-center gap-1.5 text-[0.78rem] font-medium text-accent">
          <CheckCircle2 size={14} aria-hidden />
          Marked as the answer
        </p>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[0.85rem] font-light text-ink-dim">
        <span className="font-normal text-ink">{reply.author_name}</span>
        <RoleBadge role={reply.author_role} />
        <span aria-hidden>·</span>
        <span>{when(reply.created_at)}</span>
      </p>

      <p className="mt-3 leading-relaxed font-light whitespace-pre-line text-ink-dim">
        {reply.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {canAccept && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await acceptReply(reply.id, topicId)
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-[0.82rem] font-light text-ink hover:border-accent/60 hover:text-accent disabled:opacity-60"
          >
            <CheckCircle2 size={13} aria-hidden />
            {pending ? 'Saving…' : 'This answered it'}
          </button>
        )}
        <ReportControl replyId={reply.id} signedIn={signedIn} />
      </div>
    </li>
  )
}

function ReplyForm({ topicId }: { topicId: string }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const res = await postReply(topicId, body)
          if (res.error) setError(res.error)
          else setBody('')
        })
      }}
    >
      <label htmlFor="reply" className="text-[0.85rem] font-medium text-ink-dim">
        Your reply
      </label>
      <textarea
        id="reply"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Explain the step, not just the answer — that is what makes it stick."
        className="mt-2 w-full rounded-xl border border-hairline bg-base-raised px-5 py-3 text-[0.95rem] font-light text-ink placeholder:text-white/30"
      />
      {error && (
        <p role="alert" className="mt-2 text-[0.87rem] text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-60"
      >
        {pending ? 'Posting…' : 'Post reply'}
      </button>
    </form>
  )
}

/**
 * Reporting flags a post for a moderator; it never hides anything on its own.
 * That matters on a platform used by school students — raising a concern has to
 * be easy, and silencing someone has to stay with a moderator.
 */
function ReportControl({
  topicId,
  replyId,
  signedIn,
}: {
  topicId?: string
  replyId?: string
  signedIn: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (!signedIn) return null

  if (done) {
    return (
      <p aria-live="polite" className="text-[0.8rem] font-light text-ink-dim">
        Reported. A moderator will look at it.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[0.8rem] font-light text-ink-dim hover:text-ink"
      >
        <Flag size={12} aria-hidden />
        Report
      </button>
    )
  }

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await reportPost({ topicId, replyId, reason })
          if (!res.error) setDone(true)
        })
      }}
    >
      <label htmlFor={`reason-${topicId ?? replyId}`} className="sr-only">
        Why are you reporting this?
      </label>
      <input
        id={`reason-${topicId ?? replyId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What is wrong with it?"
        className="min-w-0 flex-1 rounded-full border border-hairline bg-base px-4 py-2 text-[0.82rem] font-light text-ink placeholder:text-white/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-hairline px-4 py-2 text-[0.82rem] font-light text-ink disabled:opacity-60"
      >
        Send
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[0.8rem] font-light text-ink-dim"
      >
        Cancel
      </button>
    </form>
  )
}
