import { NextResponse } from 'next/server'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { COURSE_FIELDS, type Course } from '@/lib/catalog'

type CartRow = { course: Course }

/**
 * Starts a checkout.
 *
 * The order is created first and always — a pending row exists before Stripe is
 * involved, so a payment can always be traced back to something we recorded.
 * Nothing is enrolled here; only the webhook does that, and only after Stripe
 * confirms the money moved.
 */
export async function POST() {
  if (!isAuthConfigured) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 })
  }

  const { userId } = await getCurrentUser()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to check out.' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data: cart } = await supabase
    .from('cart_items')
    .select(`course:courses(${COURSE_FIELDS})`)
    .eq('user_id', userId)

  const lines = ((cart ?? []) as unknown as CartRow[]).filter((l) => l.course)
  if (lines.length === 0) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 })
  }

  const { data: started, error: startError } = await supabase.rpc('begin_checkout')
  if (startError) {
    return NextResponse.json({ error: startError.message }, { status: 400 })
  }

  const order = (started as { order_id: string; reference: string; total_cents: number }[])[0]
  if (!order) {
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }

  const siteUrl = await getSiteUrl()

  // Nothing to charge, or no payment provider configured: settle it directly.
  if (order.total_cents === 0 || !isStripeConfigured) {
    const { error } = await supabase.rpc('claim_free_order', { order_id: order.order_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({
      url: `/cart/complete?ref=${encodeURIComponent(order.reference)}`,
      paid: true,
      free: order.total_cents === 0,
    })
  }

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.order_id,
    metadata: { order_id: order.order_id, reference: order.reference },
    line_items: lines.map((l) => ({
      quantity: 1,
      price_data: {
        currency: (l.course.currency ?? 'NZD').toLowerCase(),
        unit_amount: l.course.price_cents,
        product_data: {
          name: l.course.title,
          description: l.course.summary ?? undefined,
        },
      },
    })),
    success_url: `${siteUrl}/cart/complete?ref=${encodeURIComponent(order.reference)}`,
    cancel_url: `${siteUrl}/cart?cancelled=1`,
  })

  const { error: attachError } = await supabase.rpc('attach_stripe_session', {
    order_id: order.order_id,
    session_id: session.id,
  })
  if (attachError) {
    return NextResponse.json({ error: attachError.message }, { status: 500 })
  }

  return NextResponse.json({ url: session.url, paid: false })
}
