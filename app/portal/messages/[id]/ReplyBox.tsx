'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMessage } from '@/app/portal/messages-actions'

export default function ReplyBox({ threadId }: { threadId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)

    start(async () => {
      const result = await sendMessage(threadId, body)
      if (result.error) {
        setError(result.error)
        return
      }
      // Cleared only after the server accepted it. Clearing optimistically
      // would lose what somebody wrote if the send failed.
      setBody('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="reply" className="sr-only">
        Your reply
      </label>
      <textarea
        id="reply"
        rows={3}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        className="w-full rounded-xl border border-app-border bg-transparent px-4 py-3 text-[0.92rem]"
      />
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[0.86rem] font-light text-[#C2410C]">
          {error}
        </p>
      )}
    </form>
  )
}
