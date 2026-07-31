import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Clock } from 'lucide-react'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { formatPrice } from '@/lib/catalog'
import { getShopHeader } from '@/lib/shop-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'

export const metadata: Metadata = { title: 'Order complete — StudEasy', robots: { index: false } }

/**
 * Where Stripe returns the buyer. Deliberately reads the order rather than
 * trusting the redirect: arriving here proves the browser came back, not that
 * the payment cleared. The webhook is what settles it, so an order still
 * pending shows as pending.
 */
export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams
  const [header, { userId }] = await Promise.all([getShopHeader(), getCurrentUser()])

  type OrderSummary = { reference: string; status: string; total_cents: number }
  let order: OrderSummary | null = null

  if (isAuthConfigured && userId && ref) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('orders')
      .select('reference, status, total_cents')
      .eq('reference', ref)
      .maybeSingle()
    order = (data as OrderSummary | null) ?? null
  }

  const paid = order?.status === 'paid'

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="rounded-2xl border border-hairline bg-base-raised p-8">
          {paid ? (
            <CheckCircle2 size={28} aria-hidden className="text-accent" strokeWidth={1.6} />
          ) : (
            <Clock size={28} aria-hidden className="text-accent" strokeWidth={1.6} />
          )}

          <h1 className="mt-5 text-[1.5rem] font-semibold tracking-tight text-ink">
            {paid ? "You're enrolled" : 'Payment is being confirmed'}
          </h1>

          {order ? (
            <>
              <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
                Order <span className="font-mono text-ink">{order.reference}</span> ·{' '}
                {formatPrice(order.total_cents)}
              </p>
              <p className="mt-4 text-[0.95rem] leading-relaxed font-light text-ink-dim">
                {paid
                  ? 'Your courses are in your portal now.'
                  : 'Your bank has the payment. Enrolment appears as soon as Stripe confirms it — usually seconds. Refresh this page in a moment.'}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
              We could not find that order against your account. If you were charged,
              nothing is lost — check your portal, or get in touch with the reference from
              your receipt.
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/portal/student"
              className="rounded-full bg-accent px-7 py-3 text-[0.92rem] font-medium text-[#100c00]"
            >
              Go to my courses
            </Link>
            <Link
              href="/courses"
              className="rounded-full border border-hairline px-7 py-3 text-[0.92rem] font-light text-ink"
            >
              Keep browsing
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
