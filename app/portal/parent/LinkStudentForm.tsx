'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestStudentLink } from '@/app/auth/actions'

const OUTCOME: Record<string, string> = {
  requested: 'Sent. Your child needs to approve it from their own portal before you see anything.',
  already_requested: 'You have already asked. It is waiting for your child to approve it.',
  already_linked: 'You are already linked to that student.',
}

export default function LinkStudentForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)

    const result = await requestStudentLink(code.trim())
    if (result.error) {
      setError(result.error)
      setBusy(false)
      return
    }
    setNote(OUTCOME[result.state ?? 'requested'] ?? OUTCOME.requested)
    setCode('')
    setBusy(false)
    router.refresh()
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="student-code"
            className="block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase"
          >
            Ask to follow a student
          </label>
          <input
            id="student-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="STU-4KX9P2"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'student-code-error' : 'student-code-hint'}
            className={`mt-2 w-full rounded-xl border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted ${
              error ? 'border-app-bad' : 'border-app-border'
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-40"
        >
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>

      <p id="student-code-hint" className="mt-3 text-[0.84rem] leading-relaxed font-light text-app-muted">
        Your child&rsquo;s Student ID is on their portal. Entering it sends them a request —
        nothing about them is visible to you until they approve it.
      </p>

      {error && (
        <p id="student-code-error" role="alert" className="mt-3 text-[0.87rem] font-light text-app-bad">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-3 text-[0.87rem] font-light text-app-good">
          {note}
        </p>
      )}
    </form>
  )
}
