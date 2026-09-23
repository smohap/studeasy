'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, ShieldCheck } from 'lucide-react'
import { CONSENT_AGE } from '@/lib/consent'
import { Panel } from '@/components/app/Ui'
import { resendConsentEmail, changeParentEmail } from './consent-actions'
import type { ConsentEmailResult } from './consent-actions'

/**
 * What a student below the age of consent sees instead of their dashboard.
 *
 * The way out is not a button on this screen — it is a parent or caregiver
 * opening an emailed link, or, for a student with a linked parent account,
 * that parent confirming from their own portal. What this screen owns is
 * honesty about which of those is true right now: whether a link has
 * actually gone out and to which address, or that nothing has been sent yet,
 * or that there is no address at all. It never says "we emailed" when the
 * database has no invitation to show for it.
 */
export default function ConsentWaiting({
  name,
  maskedEmail,
  hasInvitation,
  parentLinked: initiallyLinked = false,
}: {
  name: string | null
  maskedEmail: string | null
  hasInvitation: boolean
  /** The student has a linked parent account — the email route is closed. */
  parentLinked?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentMasked, setCurrentMasked] = useState(maskedEmail)
  const [sent, setSent] = useState(hasInvitation)
  const [editing, setEditing] = useState(maskedEmail === null)
  const [newEmail, setNewEmail] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [parentLinked, setParentLinked] = useState(initiallyLinked)

  function apply(result: ConsentEmailResult) {
    if (result.ok) {
      setCurrentMasked(result.maskedEmail)
      setSent(true)
      setFailed(false)
      setEditing(false)
      setNewEmail('')
      setFeedback('Sent. Check back once your parent or caregiver has opened it.')
      router.refresh()
      return
    }

    if (result.reason === 'parent_linked') {
      setParentLinked(true)
      setFailed(false)
      setEditing(false)
      setFeedback(null)
      return
    }

    setFailed(true)
    if (result.reason === 'error') {
      setFeedback(result.message)
    } else if (result.retryAfter) {
      const when = new Date(result.retryAfter)
      const at = Number.isNaN(when.getTime())
        ? 'in a few minutes'
        : `at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      setFeedback(`You've just sent this — try again ${at}.`)
    } else {
      setFeedback("You've sent this a few times today — you can try again tomorrow.")
    }
  }

  function resend() {
    setFeedback(null)
    startTransition(async () => {
      apply(await resendConsentEmail())
    })
  }

  function submitNewAddress(e: FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      apply(await changeParentEmail(newEmail))
    })
  }

  /*
   * One sentence, chosen from what is actually true — never "we emailed"
   * unless an invitation exists. `sent` starts as hasInvitation and only
   * becomes true on a successful send from this screen.
   */
  function whatHappensNext(): string {
    if (parentLinked) {
      return 'Your linked parent or caregiver can confirm your account from their own StudEasy account — ask them to sign in and do it there. No email is needed.'
    }
    if (currentMasked && sent) {
      return `We emailed ${currentMasked} a link. Once a parent or caregiver opens it and agrees, your account unlocks — there is nothing else for you to do.`
    }
    if (currentMasked) {
      return `Nothing has been sent yet. Press “Send the email” to send ${currentMasked} a link — a parent or caregiver has to open it and agree before your account unlocks.`
    }
    return "Add a parent or caregiver's email below and we will send them a link. Your account unlocks once they open it and agree."
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          Nearly there, {name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          One thing has to happen before you can start.
        </p>
      </header>

      <Panel
        title="A parent or caregiver needs to confirm your account"
        subtitle={`Anyone under ${CONSENT_AGE} needs this. It is a one-off.`}
      >
        <div className="flex gap-4">
          <ShieldCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-app-warn" />
          <div className="flex flex-col gap-4 text-[0.92rem] leading-relaxed font-light text-app-muted">
            <p>{whatHappensNext()}</p>
            <p>
              Until then you can sign in and look around, but homework, assessments and
              the progress pages stay locked — and nothing you do is recorded.
            </p>
          </div>
        </div>

        {!parentLinked && currentMasked && !editing && (
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-app-border bg-app-subtle p-6">
            <div className="flex items-center gap-3">
              <Mail size={18} aria-hidden className="shrink-0 text-app-muted" />
              <div>
                <p className="text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase">
                  {sent ? 'Sent to' : 'Will be sent to'}
                </p>
                <p className="mt-1 font-mono text-[1rem] text-app-ink">{currentMasked}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resend}
                disabled={isPending}
                className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
              >
                {isPending ? 'Sending…' : sent ? 'Resend the email' : 'Send the email'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(true)
                  setFeedback(null)
                }}
                disabled={isPending}
                className="rounded-full border border-app-border bg-app-panel px-5 py-2.5 text-[0.86rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-50"
              >
                Wrong address?
              </button>
            </div>
          </div>
        )}

        {!parentLinked && editing && (
          <form
            onSubmit={submitNewAddress}
            className="mt-6 flex flex-col gap-3 rounded-2xl border border-app-border bg-app-subtle p-6"
          >
            <label
              htmlFor="parent-email"
              className="text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase"
            >
              {currentMasked ? "Parent or caregiver's email" : 'Add a parent or caregiver email'}
            </label>
            <input
              id="parent-email"
              type="email"
              required
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-app-border bg-app-panel px-4 py-2.5 text-[0.92rem] text-app-ink placeholder:text-app-muted/60"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-50"
              >
                {isPending ? 'Sending…' : 'Send the email'}
              </button>
              {currentMasked && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setFeedback(null)
                  }}
                  disabled={isPending}
                  className="rounded-full border border-app-border bg-app-panel px-5 py-2.5 text-[0.86rem] font-medium text-app-ink hover:bg-app-subtle disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {feedback && (
          <p
            role="status"
            className={`mt-4 text-[0.88rem] font-light ${failed ? 'text-app-bad' : 'text-app-good'}`}
          >
            {feedback}
          </p>
        )}
      </Panel>

      <Panel
        title="Need a hand?"
        subtitle="If the email never turns up, or something looks wrong, we can sort it out."
      >
        <p className="text-[0.92rem] leading-relaxed font-light text-app-muted">
          <Link href="/contact" className="text-app-ink underline hover:no-underline">
            Contact StudEasy
          </Link>{' '}
          and tell us what is happening.
        </p>
      </Panel>
    </div>
  )
}
