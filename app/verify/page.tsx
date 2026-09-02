import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getShopHeader } from '@/lib/shop-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Verify a certificate — StudEasy',
  description:
    'Check that a StudEasy certificate is genuine using the serial printed on it.',
}

/*
 * Deliberately open to anyone, signed in or not. A certificate only a StudEasy
 * account can check is worth nothing to the school or employer being shown it.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>
}) {
  const { serial } = await searchParams

  // A plain GET form is enough, and it keeps the result on a shareable URL.
  if (serial?.trim()) {
    redirect(`/verify/${encodeURIComponent(serial.trim().toUpperCase())}`)
  }

  const header = await getShopHeader()

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-24">
        <ShieldCheck size={30} aria-hidden className="text-accent" strokeWidth={1.6} />
        <h1 className="mt-5 text-[clamp(2rem,6vw,3rem)] leading-[1.08] font-extrabold tracking-tight text-ink">
          Verify a certificate
        </h1>
        <p className="mt-5 text-[1.02rem] leading-relaxed font-light text-ink-dim">
          Every StudEasy certificate carries a serial. Enter it below and we will confirm
          what it is for, who holds it, and when it was issued.
        </p>

        <form method="get" className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="serial" className="sr-only">
              Certificate serial
            </label>
            <input
              id="serial"
              name="serial"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="A1B2C3D4E5F6"
              className="w-full rounded-full border border-hairline bg-base-raised px-6 py-3.5 text-center font-mono text-[1rem] tracking-[0.15em] text-ink uppercase placeholder:text-white/25 sm:text-left"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-accent px-8 py-3.5 text-[0.92rem] font-medium text-[#100c00]"
          >
            Check it
          </button>
        </form>

        <p className="mt-6 text-[0.87rem] leading-relaxed font-light text-ink-dim">
          The serial is twelve characters, printed on the certificate itself. We show only
          what the certificate already says — nothing else about the person who holds it.
        </p>
      </main>

      <Footer />
    </>
  )
}
