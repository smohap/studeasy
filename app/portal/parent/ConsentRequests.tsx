'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { grantParentalConsent, withdrawParentalConsent } from '@/app/auth/actions'
import { CONSENT_AGE } from '@/lib/consent'
import { Panel } from '@/components/app/Ui'

export type AwaitingChild = {
  student_id: string
  full_name: string | null
  student_code: string | null
  born: string | null
}

export type ConsentedChild = {
  id: string
  full_name: string | null
  consent_granted_at: string | null
}

/**
 * The one screen where a parent is actually asked for something.
 *
 * It says what is being consented to in the words of what will happen, not in
 * the words of a privacy policy — "their answers will be recorded and marked"
 * rather than "processing of personal data for the purposes of service
 * provision". A consent nobody understood is not worth collecting, and this is
 * the only place the platform ever asks.
 *
 * There is no pre-ticked box and no "confirm all". Each child is a separate,
 * deliberate action.
 */
export default function ConsentRequests({
  children,
  granted,
}: {
  children: AwaitingChild[]
  granted: ConsentedChild[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (children.length === 0 && granted.length === 0) return null

  function confirm(id: string) {
    setBusyId(id)
    setError(null)
    startTransition(async () => {
      const result = await grantParentalConsent(id)
      if (result.error) setError(result.error)
      setBusyId(null)
      router.refresh()
    })
  }

  function withdraw(id: string) {
    setBusyId(id)
    setError(null)
    startTransition(async () => {
      const result = await withdrawParentalConsent(id)
      if (result.error) setError(result.error)
      setBusyId(null)
      router.refresh()
    })
  }

  /*
   * The withdrawal half. It is here rather than tucked into a settings page
   * because the panel above tells a parent they can withdraw "from this page",
   * and a promise like that has to be true on the screen that makes it.
   */
  const withdrawal = granted.length > 0 && (
    <Panel
      title="Consent you have given"
      subtitle="You can take this back at any time."
    >
      <ul className="flex flex-col gap-3">
        {granted.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-app-border px-5 py-4"
          >
            <div>
              <p className="text-[0.98rem] font-medium text-app-ink">
                {c.full_name ?? 'Your child'}
              </p>
              <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                {c.consent_granted_at
                  ? `Confirmed ${new Date(c.consent_granted_at).toLocaleDateString('en-NZ')}`
                  : 'Confirmed'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => withdraw(c.id)}
              disabled={busyId !== null}
              className="rounded-full border border-app-border px-6 py-2.5 text-[0.88rem] font-light text-app-ink disabled:opacity-50"
            >
              {busyId === c.id ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.85rem] leading-relaxed font-light text-app-muted">
        Withdrawing stops any further work being recorded and locks their account
        again. What has already been marked stays as it is.
      </p>
    </Panel>
  )

  if (children.length === 0) return <>{withdrawal}</>

  return (
    <>
    <Panel
      title={
        children.length === 1
          ? 'One of your children is waiting on you'
          : `${children.length} of your children are waiting on you`
      }
      subtitle={`Anyone under ${CONSENT_AGE} needs a parent or caregiver to confirm their account before they can start.`}
    >
      <div className="flex gap-4 rounded-2xl border border-app-border bg-app-subtle p-5">
        <ShieldCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-app-warn" />
        <div className="flex flex-col gap-3 text-[0.9rem] leading-relaxed font-light text-app-muted">
          <p className="text-app-ink">What you are agreeing to:</p>
          <p>
            That we may keep a record of your child&rsquo;s work — the questions they
            answer, whether they got them right, and the marks a tutor gives them — and
            show it to you and to the tutors teaching them.
          </p>
          <p>
            Nothing is shared outside StudEasy, and you can withdraw this at any time
            from this page. Withdrawing stops any further work being recorded; it does
            not delete what is already there, which is a separate request you can make
            by writing to us.
          </p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {children.map((c) => (
          <li
            key={c.student_id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-app-border px-5 py-4"
          >
            <div>
              <p className="text-[0.98rem] font-medium text-app-ink">
                {c.full_name ?? 'Your child'}
              </p>
              <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                {c.student_code ?? 'No Student ID'}
                {c.born && ` · born ${new Date(c.born).toLocaleDateString('en-NZ')}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => confirm(c.student_id)}
              disabled={busyId !== null}
              className="rounded-full bg-app-ink px-6 py-2.5 text-[0.88rem] font-medium text-white disabled:opacity-50"
            >
              {busyId === c.student_id ? 'Confirming…' : 'I confirm'}
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-[0.88rem] font-light text-app-bad">
          {error}
        </p>
      )}
    </Panel>
    {withdrawal}
    </>
  )
}
