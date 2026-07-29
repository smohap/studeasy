'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { linkStudent } from '@/app/auth/actions'
import { TextField } from '@/components/Field'

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
    <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <TextField
          label="Link another student"
          placeholder="STU-4KX9P2"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error ?? undefined}
        />
      </div>
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="rounded-full bg-accent px-7 py-3.5 text-[0.92rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
      >
        {busy ? 'Linking…' : 'Link'}
      </button>
    </form>
  )
}
