import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import {
  STRIPE_WEBHOOK_SECRET,
  createServiceClient,
  getStripe,
  isStripeConfigured,
} from '@/lib/stripe'

/**
 * Stripe's confirmation that money moved. This is the only route that may
 * enrol a student off the back of a payment.
 *
 * The raw body is required — Stripe signs the exact bytes, so it must not be
 * parsed as JSON before verification. A forged request without a valid
 * signature is rejected before anything touches the database.
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 })
  }

  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // `complete` but unpaid happens for async methods; wait for the
        // async_payment_succeeded event instead of enrolling early.
        if (session.payment_status !== 'paid') break

        const { error } = await supabase.rpc('mark_order_paid', {
          session_id: session.id,
          payment_intent:
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
        })
        if (error) throw new Error(error.message)
        break
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        const { error } = await supabase.rpc('mark_order_paid', {
          session_id: session.id,
          payment_intent:
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
        })
        if (error) throw new Error(error.message)
        break
      }

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        await supabase
          .from('orders')
          .update({
            status: event.type === 'checkout.session.expired' ? 'cancelled' : 'failed',
            failure_reason: event.type,
          })
          .eq('stripe_session_id', session.id)
          .eq('status', 'pending')
        break
      }

      default:
        // Everything else is acknowledged and ignored.
        break
    }
  } catch (err) {
    // A non-2xx tells Stripe to retry. mark_order_paid is idempotent, so a
    // retry after a partial failure is safe.
    console.error(`Webhook handling failed for ${event.type}:`, err)
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
