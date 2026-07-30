import type { Metadata } from 'next'
import Link from 'next/link'
import { getCart, getShopHeader } from '@/lib/shop-data'
import ShopNav from '@/components/shop/ShopNav'
import CartView from './CartView'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Your cart — StudEasy',
  robots: { index: false },
}

export default async function CartPage() {
  const [header, lines] = await Promise.all([getShopHeader(), getCart()])

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-gradient display text-[clamp(2.2rem,7vw,4rem)]">Your cart</h1>

        {!header.signedIn ? (
          <div className="mt-10 rounded-2xl border border-hairline bg-base-raised p-8">
            <p className="text-[1rem] font-medium text-ink">Sign in to see your cart</p>
            <p className="mt-2 text-[0.94rem] leading-relaxed font-light text-ink-dim">
              Your cart is kept against your account, so it follows you between devices.
            </p>
            <Link
              href="/sign-in?next=/cart"
              className="mt-6 inline-block rounded-full bg-accent px-7 py-3 text-[0.92rem] font-medium text-[#100c00]"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <CartView lines={lines} />
        )}
      </main>

      <Footer />
    </>
  )
}
