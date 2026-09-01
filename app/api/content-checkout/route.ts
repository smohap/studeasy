import { NextResponse } from 'next/server'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

/**
 * Buys one item from the library.
 *
 * Same contract as the other checkouts: the order exists before Stripe is
 * involved, and only the webhook settles it. begin_content_checkout() refuses
 * anything free, unpublished, or already owned, so this cannot be used to pay
 * twice for the same worksheet.
 */
export async function POST(request: Request) {
  if (!isAuthConfigured) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 })
  }

  const { userId } = await getCurrentUser()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to buy this.' }, { status: 401 })
  }

  const { contentId } = (await request.json()) as { contentId?: string }
  if (!contentId) {
    return NextResponse.json({ error: 'Which item?' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: row } = await supabase
    .from('content_items')
    .select('title, summary, currency, price_cents')
    .eq('id', contentId)
    .maybeSingle()

  const item = row as {
    title: string
    summary: string | null
    currency: string
    price_cents: number
  } | null

  if (!item) {
    return NextResponse.json({ error: 'That item does not exist.' }, { status: 404 })
  }

  const { data: started, error: startError } = await supabase.rpc(
    'begin_content_checkout',
    { content: contentId },
  )
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
    return NextResponse.json({ url: `/library/${contentId}?paid=1`, paid: true })
  }

  const stripe = getStripe()
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.order_id,
    metadata: {
      order_id: order.order_id,
      reference: order.reference,
      content_id: contentId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (item.currency ?? 'NZD').toLowerCase(),
          unit_amount: item.price_cents,
          product_data: {
            name: item.title,
            description: item.summary ?? undefined,
          },
        },
      },
    ],
    success_url: `${siteUrl}/library/${contentId}?paid=1`,
    cancel_url: `${siteUrl}/library/${contentId}?cancelled=1`,
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
