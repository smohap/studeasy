'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { linkStudent } from '@/app/auth/actions'

export default function LinkStudentForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const result = await linkStudent(code.trim())
    if (result.error) {
      setError(result.error)
      setBusy(false)
      return
    }
    setCode('')
    setBusy(false)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label
          htmlFor="student-code"
          className="block text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase"
        >
          Link another student
        </label>
        <input
          id="student-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="STU-4KX9P2"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'student-code-error' : undefined}
          className={`mt-2 w-full rounded-xl border bg-app px-4 py-3 text-[0.95rem] font-light text-app-ink placeholder:text-app-muted ${
            error ? 'border-app-bad' : 'border-app-border'
          }`}
        />
        {error && (
          <p id="student-code-error" role="alert" className="mt-2 text-[0.85rem] font-light text-app-bad">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-40"
      >
        {busy ? 'Linking…' : 'Link'}
      </button>
    </form>
  )
}
