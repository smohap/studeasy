'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { redeemConsent } from '../actions'

/**
 * One button, no pre-ticked box, no auto-submit. Consent only happens on a
 * real POST — a mail scanner following the GET link on the page above must
 * never trigger it, which is why nothing here fires until this button is
 * clicked.
 */
export default function ConsentForm({
  token,
  studentName,
}: {
  token: string
  studentName: string
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; studentName?: string } | null>(
    null,
  )

  if (result?.ok) {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-2xl border border-hairline bg-base p-5 text-[0.92rem] leading-relaxed font-light text-ink"
      >
        <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        {/* The "not the parent? close this page" line lives above the button:
            after the click it would be advice that arrives too late. */}
        <p>
          Thanks &mdash; {result.studentName} is confirmed. They can sign in and get
          started.
        </p>
      </div>
    )
  }

  function confirm() {
    startTransition(async () => {
      const outcome = await redeemConsent(token)
      setResult(outcome.ok ? { ok: true, studentName: outcome.studentName } : { ok: false })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {result && !result.ok && (
        <p
          role="alert"
          className="flex gap-3 rounded-2xl border border-[#E88A8A]/40 bg-[#E88A8A]/[0.07] p-4 text-[0.88rem] leading-relaxed font-light text-ink"
        >
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-[#E88A8A]" />
          This link is no longer valid.
        </p>
      )}

      <p className="text-[0.88rem] leading-relaxed font-light text-ink-dim">
        If you are not this child&rsquo;s parent or caregiver, close this page
        without pressing the button.
      </p>

      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        className="w-full rounded-2xl bg-accent px-5 py-3.5 text-[0.98rem] font-medium text-base transition-opacity disabled:opacity-60"
      >
        {pending ? 'Confirming…' : `Yes, I agree — confirm ${studentName}'s account`}
      </button>
    </div>
  )
}
