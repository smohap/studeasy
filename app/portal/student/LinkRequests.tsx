'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { respondToLinkRequest } from '@/app/auth/actions'
import { Panel } from '@/components/app/Ui'

export type LinkRequest = {
  id: string
  parent_name: string | null
  parent_email: string | null
  asked_at: string
}

/**
 * The confirmation step. A parent quoting a Student ID only creates a request;
 * nothing about this student is visible to them until it is approved here.
 */
export default function LinkRequests({ requests }: { requests: LinkRequest[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (requests.length === 0) return null

  function answer(id: string, accept: boolean) {
    setBusyId(id)
    setError(null)
    startTransition(async () => {
      const result = await respondToLinkRequest(id, accept)
      if (result.error) setError(result.error)
      setBusyId(null)
      router.refresh()
    })
  }

  return (
    <Panel
      title={requests.length === 1 ? 'Someone wants to follow your progress' : 'Link requests'}
      subtitle="They cannot see your homework, marks or reports unless you say yes."
    >
      <ul className="flex flex-col gap-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-4 rounded-xl border border-app-warn/30 bg-app-warn-bg p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <UserPlus size={18} aria-hidden className="mt-0.5 shrink-0 text-app-warn" />
              <div>
                <p className="text-[0.95rem] font-medium text-app-ink">
                  {r.parent_name ?? 'A parent account'}
                </p>
                <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                  {r.parent_email}
                </p>
                <p className="mt-1.5 text-[0.82rem] font-light text-app-muted">
                  If you do not recognise this, decline it.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => answer(r.id, true)}
                disabled={isPending && busyId === r.id}
                className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
              >
                Yes, that&rsquo;s my parent
              </button>
              <button
                type="button"
                onClick={() => answer(r.id, false)}
                disabled={isPending && busyId === r.id}
                className="rounded-full border border-app-border bg-app-panel px-5 py-2.5 text-[0.86rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-[0.88rem] font-light text-app-bad">
          {error}
        </p>
      )}
    </Panel>
  )
}
