'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Panel, StatusChip } from '@/components/app/Ui'
import type { Status } from '@/types/dashboard'
import { formatMoney } from '@/lib/class-types'
import type { RefundRow, RefundableOrder } from '@/lib/admin-data'
import { createRefund, type RefundReason } from './refund-actions'

const REASONS: { value: RefundReason; label: string }[] = [
  { value: 'requested_by_customer', label: 'The customer asked for it' },
  { value: 'service_not_provided', label: 'We did not deliver the teaching' },
  { value: 'duplicate', label: 'They were charged twice' },
  { value: 'fraudulent', label: 'The charge was fraudulent' },
]

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REASONS.map((r) => [r.value, r.label]),
)

const TONE: Record<RefundRow['status'], Status> = {
  requested: { tone: 'warn', label: 'Not sent yet' },
  processing: { tone: 'warn', label: 'With Stripe' },
  succeeded: { tone: 'good', label: 'Refunded' },
  failed: { tone: 'bad', label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

export default function RefundPanel({
  refunds,
  orders,
}: {
  refunds: RefundRow[]
  orders: RefundableOrder[]
}) {
  const router = useRouter()
  const [orderId, setOrderId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<RefundReason>('requested_by_customer')
  const [note, setNote] = useState('')
  const [revoke, setRevoke] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const order = orders.find((o) => o.id === orderId) ?? null
  // Cents, not dollars, all the way to Stripe. Rounding once here is the only
  // place the decimal the admin typed becomes an integer.
  const cents = Math.round(Number(amount || '0') * 100)
  const overLimit = order !== null && cents > order.refundableCents

  function reset() {
    setConfirming(false)
    setOrderId('')
    setAmount('')
    setNote('')
    setRevoke(true)
  }

  function send() {
    if (!order) return
    setError(null)
    setDone(null)
    start(async () => {
      const res = await createRefund({
        orderId: order.id,
        amountCents: cents,
        reason,
        note,
        revokeAccess: revoke,
      })
      if (res.error) {
        setError(res.error)
        setConfirming(false)
        return
      }
      setDone(
        'Sent to Stripe. It shows as "With Stripe" until the webhook confirms the money moved — only then is the order marked refunded and the seat withdrawn.',
      )
      reset()
      router.refresh()
    })
  }

  return (
    <>
      <Panel
        title="Refund an order"
        subtitle="Sends money back through Stripe. The seat and the tutor's credit change only once Stripe confirms it."
      >
        {orders.length === 0 ? (
          <p className="text-[0.88rem] font-light text-app-muted">
            No paid order currently has anything left to refund. Free enrolments
            and orders settled outside Stripe never appear here — there is no
            charge to reverse.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="rf-order">
                Order
              </label>
              <select
                id="rf-order"
                className={`${field} mt-1.5`}
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value)
                  setConfirming(false)
                  const picked = orders.find((o) => o.id === e.target.value)
                  /*
                   * Default to the whole remaining balance. A full refund is
                   * the common case, and typing an amount by hand is exactly
                   * where a decimal point ends up in the wrong place.
                   */
                  setAmount(picked ? (picked.refundableCents / 100).toFixed(2) : '')
                }}
              >
                <option value="">Choose an order…</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.reference} — {o.buyerName ?? 'Unknown buyer'} —{' '}
                    {formatMoney(o.refundableCents)} refundable
                  </option>
                ))}
              </select>
            </div>

            {order && (
              <div className="rounded-lg border border-app-border bg-app p-4 text-[0.86rem] font-light text-app-muted">
                <p className="text-app-ink">{order.items ?? 'No items recorded'}</p>
                <p className="mt-2">
                  Paid {formatMoney(order.totalCents)}
                  {order.refundedCents > 0 &&
                    ` · ${formatMoney(order.refundedCents)} already refunded`}
                  {' · '}
                  {formatMoney(order.refundableCents)} still refundable
                  {order.paidAt &&
                    ` · ${new Date(order.paidAt).toLocaleDateString('en-NZ')}`}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="rf-amount">
                  Amount to refund
                </label>
                <input
                  id="rf-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className={`${field} mt-1.5`}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setConfirming(false)
                  }}
                />
                {overLimit && order && (
                  <p
                    role="alert"
                    className="mt-1.5 text-[0.8rem] font-light text-app-bad"
                  >
                    More than the {formatMoney(order.refundableCents)} still
                    refundable on this order.
                  </p>
                )}
              </div>
              <div>
                <label className={label} htmlFor="rf-reason">
                  Reason
                </label>
                <select
                  id="rf-reason"
                  className={`${field} mt-1.5`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as RefundReason)}
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={label} htmlFor="rf-note">
                Note — kept on the record, never shown to the customer
              </label>
              <input
                id="rf-note"
                className={`${field} mt-1.5`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Who asked, and what was agreed."
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-app-border bg-app p-3.5">
              <input
                type="checkbox"
                checked={revoke}
                onChange={(e) => setRevoke(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[0.86rem] leading-relaxed font-light text-app-ink">
                Withdraw the student&rsquo;s access to what they bought.
                <span className="mt-1 block text-app-muted">
                  Leave this off for a goodwill partial refund — a family who
                  got most of a term should usually keep the course. It applies
                  only if the refund actually succeeds.
                </span>
              </span>
            </label>

            {error && (
              <p role="alert" className="text-[0.85rem] font-light text-app-bad">
                {error}
              </p>
            )}
            {done && (
              <p role="status" className="text-[0.85rem] font-light text-app-good">
                {done}
              </p>
            )}

            {confirming && order ? (
              <div className="rounded-lg border border-app-bad/40 bg-app-bad-bg p-4">
                <p className="flex items-start gap-2.5 text-[0.9rem] font-medium text-app-bad">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  Send {formatMoney(cents)} back to{' '}
                  {order.buyerName ?? 'this customer'} for {order.reference}?
                </p>
                <p className="mt-2 text-[0.85rem] leading-relaxed font-light text-app-bad">
                  This moves real money and cannot be undone from here.
                  {revoke
                    ? ' Their access to the course will be withdrawn once it settles.'
                    : ' They will keep their access.'}
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={send}
                    className="rounded-lg bg-app-bad px-4 py-2 text-[0.86rem] font-medium text-white disabled:opacity-60"
                  >
                    {pending ? 'Sending…' : `Yes, refund ${formatMoney(cents)}`}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-app-border px-4 py-2 text-[0.86rem] font-light text-app-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /*
               * Two steps on purpose. Everything else in this portal saves on
               * one click; this one names the amount and the person before it
               * will do anything, because it is the only control in the app
               * that moves money out.
               */
              <button
                type="button"
                disabled={!order || cents <= 0 || overLimit || pending}
                onClick={() => {
                  setError(null)
                  setDone(null)
                  setConfirming(true)
                }}
                className="self-start rounded-lg bg-app-ink px-4 py-2 text-[0.86rem] font-medium text-white disabled:opacity-50"
              >
                Review this refund
              </button>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Refunds" subtitle="Anything unsettled is listed first.">
        {refunds.length === 0 ? (
          <p className="text-[0.88rem] font-light text-app-muted">
            Nothing has been refunded. If you expected something here, check
            that supabase/refunds.sql has been run against this database.
          </p>
        ) : (
          <ul className="flex flex-col">
            {refunds.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-[0.94rem] font-medium text-app-ink">
                    {formatMoney(r.amountCents)} · {r.orderReference}
                  </p>
                  <p className="mt-1 text-[0.8rem] font-light text-app-muted">
                    {r.buyerName ?? 'Unknown buyer'} ·{' '}
                    {REASON_LABEL[r.reason] ?? r.reason} · asked by{' '}
                    {r.requestedByName ?? 'an administrator'} on{' '}
                    {new Date(r.requestedAt).toLocaleDateString('en-NZ')}
                  </p>
                  {r.note && (
                    <p className="mt-1 text-[0.8rem] font-light text-app-muted">
                      {r.note}
                    </p>
                  )}
                  {r.failureReason && (
                    <p className="mt-1 text-[0.8rem] font-light text-app-bad">
                      {r.failureReason}
                    </p>
                  )}
                </div>
                <StatusChip status={TONE[r.status]} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
