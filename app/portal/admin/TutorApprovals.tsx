'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTutorStatus } from '@/app/auth/actions'
import type { AccountStatus } from '@/lib/roles'

export type PendingTutor = {
  id: string
  full_name: string | null
  email: string | null
  teaching_subjects: string[]
  status: AccountStatus
  created_at: string
}

export default function TutorApprovals({
  pending,
  decided,
}: {
  pending: PendingTutor[]
  decided: PendingTutor[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function decide(id: string, next: 'active' | 'rejected') {
    setBusyId(id)
    setError(null)
    startTransition(async () => {
      const result = await setTutorStatus(id, next)
      if (result.error) setError(result.error)
      setBusyId(null)
      router.refresh()
    })
  }

  return (
    <>
      {pending.length === 0 ? (
        <p className="text-[0.94rem] font-light text-ink-dim">
          Nothing waiting. New tutor registrations appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-4 rounded-2xl border border-accent/25 bg-accent/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[1rem] font-medium text-ink">{t.full_name ?? 'Unnamed'}</p>
                <p className="mt-1 text-[0.88rem] font-light text-ink-dim">{t.email}</p>
                <p className="mt-2 text-[0.88rem] font-light text-ink-dim">
                  Wants to teach:{' '}
                  {t.teaching_subjects.length > 0 ? t.teaching_subjects.join(', ') : '—'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => decide(t.id, 'active')}
                  disabled={isPending && busyId === t.id}
                  className="rounded-full bg-accent px-5 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide(t.id, 'rejected')}
                  disabled={isPending && busyId === t.id}
                  className="rounded-full border border-hairline px-5 py-2.5 text-[0.88rem] font-light text-ink transition-colors hover:border-ink/40 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}

      {decided.length > 0 && (
        <div className="mt-8 border-t border-hairline pt-6">
          <h3 className="text-[0.78rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
            Already decided
          </h3>
          <ul className="mt-4 flex flex-col gap-2">
            {decided.map((t) => (
              <li key={t.id} className="flex justify-between gap-4 text-[0.9rem] font-light">
                <span className="text-ink">{t.full_name ?? t.email}</span>
                <span className={t.status === 'active' ? 'text-accent' : 'text-ink-dim'}>
                  {t.status === 'active' ? 'Approved' : 'Declined'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
