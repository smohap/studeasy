'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startThread } from '@/app/portal/messages-actions'
import type { Person } from '@/lib/messages-data'

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  tutor: 'Teacher',
  admin: 'Administrator',
}

export default function Composer({ people }: { people: Person[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await startThread(to, body, subject)
      if (result.error) {
        setError(result.error)
        return
      }
      setBody('')
      setSubject('')
      setOpen(false)
      // Straight into the conversation — the message is the point, not the form.
      if (result.threadId) router.push(`/portal/messages/${result.threadId}`)
      else router.refresh()
    })
  }

  /*
   * The recipient list comes from may_message() on the server. An empty list
   * is a real state, not an error: a brand new student has no teacher yet, and
   * saying so beats an empty dropdown.
   */
  if (people.length === 0) {
    return (
      <p className="text-[0.88rem] leading-relaxed font-light text-app-muted">
        There is nobody to message yet. Once you join a class or a course, that
        teacher appears here.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
      >
        New message
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="to"
          className="text-[0.76rem] font-medium tracking-[0.12em] text-app-muted uppercase"
        >
          To
        </label>
        <select
          id="to"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-app-border bg-transparent px-4 py-2.5 text-[0.92rem]"
        >
          <option value="">Choose someone…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {ROLE_LABEL[p.role] ?? p.role}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="subject"
          className="text-[0.76rem] font-medium tracking-[0.12em] text-app-muted uppercase"
        >
          Subject (optional)
        </label>
        <input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Thursday's class"
          className="mt-1.5 w-full rounded-xl border border-app-border bg-transparent px-4 py-2.5 text-[0.92rem]"
        />
      </div>

      <div>
        <label
          htmlFor="body"
          className="text-[0.76rem] font-medium tracking-[0.12em] text-app-muted uppercase"
        >
          Message
        </label>
        <textarea
          id="body"
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-app-border bg-transparent px-4 py-3 text-[0.92rem]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[0.88rem] font-light text-app-muted hover:text-app-ink"
        >
          Cancel
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
