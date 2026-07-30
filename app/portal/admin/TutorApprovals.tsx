'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTutorStatus } from '@/app/auth/actions'
import type { AccountStatus } from '@/lib/roles'
import { EmptyState } from '@/components/app/Ui'

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
        <EmptyState
          title="Nothing waiting"
          body="New tutor registrations land here. Until you approve one, their portal stays locked."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-4 rounded-xl border border-app-warn/30 bg-app-warn-bg p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[0.95rem] font-medium text-app-ink">
                  {t.full_name ?? 'Unnamed'}
                </p>
                <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">{t.email}</p>
                <p className="mt-1.5 text-[0.85rem] font-light text-app-muted">
                  Wants to teach:{' '}
                  {t.teaching_subjects.length > 0 ? t.teaching_subjects.join(', ') : '—'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => decide(t.id, 'active')}
                  disabled={isPending && busyId === t.id}
                  className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide(t.id, 'rejected')}
                  disabled={isPending && busyId === t.id}
                  className="rounded-full border border-app-border bg-app-panel px-5 py-2.5 text-[0.86rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[0.88rem] font-light text-app-bad">
          {error}
        </p>
      )}

      {decided.length > 0 && (
        <div className="mt-7 border-t border-app-border pt-5">
          <h3 className="text-[0.76rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
            Already decided
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {decided.map((t) => (
              <li key={t.id} className="flex justify-between gap-4 text-[0.88rem] font-light">
                <span className="text-app-ink">{t.full_name ?? t.email}</span>
                <span
                  className={
                    t.status === 'active' ? 'font-medium text-app-good' : 'text-app-muted'
                  }
                >
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
