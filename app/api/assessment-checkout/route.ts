import { NextResponse } from 'next/server'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

/**
 * Buys a single assessment.
 *
 * Mirrors /api/class-checkout: the order exists before Stripe is involved, and
 * only the webhook may settle it. begin_assessment_checkout() refuses anything
 * free, unpublished, or already available to the caller — so this cannot be
 * used to pay twice, or to buy access a class already includes.
 */
export async function POST(request: Request) {
  if (!isAuthConfigured) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 })
  }

  const { userId } = await getCurrentUser()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to buy this.' }, { status: 401 })
  }

  const { assessmentId } = (await request.json()) as { assessmentId?: string }
  if (!assessmentId) {
    return NextResponse.json({ error: 'Which assessment?' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: row } = await supabase
    .from('assessments')
    .select('title, description, currency, price_cents')
    .eq('id', assessmentId)
    .maybeSingle()

  const assessment = row as {
    title: string
    description: string | null
    currency: string
    price_cents: number
  } | null

  if (!assessment) {
    return NextResponse.json({ error: 'That assessment does not exist.' }, { status: 404 })
  }

  const { data: started, error: startError } = await supabase.rpc(
    'begin_assessment_checkout',
    { assessment: assessmentId },
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
    return NextResponse.json({ url: `/assess/${assessmentId}?paid=1`, paid: true })
  }

  const stripe = getStripe()
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.order_id,
    metadata: {
      order_id: order.order_id,
      reference: order.reference,
      assessment_id: assessmentId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (assessment.currency ?? 'NZD').toLowerCase(),
          unit_amount: assessment.price_cents,
          product_data: {
            name: assessment.title,
            description: assessment.description ?? undefined,
          },
        },
      },
    ],
    success_url: `${siteUrl}/assess/${assessmentId}?paid=1`,
    cancel_url: `${siteUrl}/assess/${assessmentId}?cancelled=1`,
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
