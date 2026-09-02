'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export type RefundReason =
  | 'requested_by_customer'
  | 'duplicate'
  | 'fraudulent'
  | 'service_not_provided'

export type RefundInput = {
  orderId: string
  amountCents: number
  reason: RefundReason
  note: string
  revokeAccess: boolean
}

export type RefundResult = { error: string | null; refundId?: string }

/**
 * Send a refund to Stripe.
 *
 * The order the three steps happen in is the whole design, and it is chosen so
 * that every way this can fail leaves something a person can see and fix:
 *
 *   1. request_refund() writes a 'requested' row. It checks the caller is an
 *      administrator, that the order is paid through Stripe, and that the
 *      amount is within what is still refundable counting refunds already in
 *      flight. Nothing about the order, the enrolment or the payout moves.
 *   2. Stripe is asked to refund. If it refuses, the row is marked failed with
 *      Stripe's own message and nothing else has changed.
 *   3. The Stripe refund id is written back, so the webhook can find this row.
 *
 * Settling — the order becoming refunded, the seat withdrawn, the teacher's
 * credit reversed — happens only in the webhook, when Stripe confirms the
 * money actually moved. Doing it here would mean a refund that fails at the
 * bank still cost a child their course.
 *
 * The crash window is between 2 and 3: Stripe has the refund but this database
 * does not know its id. The refund is then in `requested` with no Stripe id,
 * which the finance page shows as needing attention, and the id passed to
 * Stripe as metadata lets the webhook recover it.
 */
export async function createRefund(input: RefundInput): Promise<RefundResult> {
  if (!isStripeConfigured) {
    return { error: 'Stripe is not configured, so no refund can be sent.' }
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }

  const supabase = await createClient()

  // Step 1 — the record that somebody asked. Every check lives inside the
  // function, so a caller who is not an admin gets an exception, not a row.
  const { data: refundId, error: requestError } = await supabase.rpc('request_refund', {
    p_order: input.orderId,
    p_amount_cents: input.amountCents,
    p_reason: input.reason,
    p_note: input.note || null,
    p_revoke_access: input.revokeAccess,
  })

  if (requestError) return { error: requestError.message }
  if (!refundId) return { error: 'The refund could not be recorded.' }

  // The payment intent is read back rather than taken from the client: the
  // browser must not get to choose which charge is refunded.
  const { data: order } = await supabase
    .from('orders')
    .select('stripe_payment_intent, reference')
    .eq('id', input.orderId)
    .maybeSingle()

  const intent = (order as { stripe_payment_intent: string | null } | null)
    ?.stripe_payment_intent

  if (!intent) {
    await supabase.rpc('fail_refund', {
      p_refund: refundId,
      p_reason: 'That order has no Stripe payment intent to refund against.',
    })
    return { error: 'That order has no Stripe payment against it.' }
  }

  // Step 2 — Stripe.
  let stripeRefundId: string
  try {
    const refund = await getStripe().refunds.create({
      payment_intent: intent,
      amount: input.amountCents,
      reason:
        // Stripe accepts only three of our four reasons. 'service_not_provided'
        // is ours and has no Stripe equivalent, so it is sent unclassified
        // rather than mapped onto 'fraudulent', which would be a false
        // statement to a payment processor about a customer.
        input.reason === 'service_not_provided' ? undefined : input.reason,
      metadata: {
        studeasy_refund_id: String(refundId),
        studeasy_order_reference:
          (order as { reference?: string } | null)?.reference ?? '',
      },
    })
    stripeRefundId = refund.id
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe refused the refund.'
    await supabase.rpc('fail_refund', { p_refund: refundId, p_reason: message })
    revalidatePath('/portal/admin/finance')
    return { error: message }
  }

  // Step 3 — link the two, so the webhook can settle it.
  const { error: linkError } = await supabase.rpc('mark_refund_processing', {
    p_refund: refundId,
    p_stripe_refund_id: stripeRefundId,
  })

  revalidatePath('/portal/admin/finance')

  if (linkError) {
    /*
     * Stripe has the refund and will pay it. Only the link failed, and the
     * webhook can still recover it from the metadata. Reported rather than
     * swallowed, because somebody should check the row settles.
     */
    return {
      error: `The refund was sent to Stripe (${stripeRefundId}) but could not be linked here: ${linkError.message}. It should settle when Stripe confirms; check this page shortly.`,
      refundId: String(refundId),
    }
  }

  return { error: null, refundId: String(refundId) }
}
