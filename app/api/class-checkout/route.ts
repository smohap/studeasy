import { NextResponse } from 'next/server'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

/**
 * Pays for one class seat.
 *
 * Mirrors /api/checkout: the order exists before Stripe is involved, and only
 * the webhook may settle it. begin_class_checkout() refuses unless the caller
 * actually holds an unpaid seat, so this cannot be used to buy into a full
 * class.
 */
export async function POST(request: Request) {
  if (!isAuthConfigured) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 })
  }

  const { userId } = await getCurrentUser()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to pay for a seat.' }, { status: 401 })
  }

  const { classId } = (await request.json()) as { classId?: string }
  if (!classId) {
    return NextResponse.json({ error: 'Which class?' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('class_sessions')
    .select('title, topics, currency, price_cents')
    .eq('id', classId)
    .maybeSingle()

  const cls = session as {
    title: string
    topics: string | null
    currency: string
    price_cents: number
  } | null

  if (!cls) {
    return NextResponse.json({ error: 'That class does not exist.' }, { status: 404 })
  }

  const { data: started, error: startError } = await supabase.rpc('begin_class_checkout', {
    class: classId,
  })
  if (startError) {
    return NextResponse.json({ error: startError.message }, { status: 400 })
  }

  const order = (
    started as { order_id: string; reference: string; total_cents: number }[]
  )[0]
  if (!order) {
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }

  const siteUrl = await getSiteUrl()

  // Nothing to charge, or no payment provider configured: settle it directly.
  if (order.total_cents === 0 || !isStripeConfigured) {
    const { error } = await supabase.rpc('claim_free_order', { order_id: order.order_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ url: `/classes/${classId}?paid=1`, paid: true })
  }

  const stripe = getStripe()
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.order_id,
    metadata: { order_id: order.order_id, reference: order.reference, class_id: classId },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (cls.currency ?? 'NZD').toLowerCase(),
          unit_amount: cls.price_cents,
          product_data: {
            name: cls.title,
            description: cls.topics ?? undefined,
          },
        },
      },
    ],
    success_url: `${siteUrl}/classes/${classId}?paid=1`,
    cancel_url: `${siteUrl}/classes/${classId}?cancelled=1`,
  })

  const { error: attachError } = await supabase.rpc('attach_stripe_session', {
    order_id: order.order_id,
    session_id: checkout.id,
  })
  if (attachError) {
    return NextResponse.json({ error: attachError.message }, { status: 500 })
  }

  return NextResponse.json({ url: checkout.url, paid: false })
}
