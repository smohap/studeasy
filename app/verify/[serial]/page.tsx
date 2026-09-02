import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, ShieldX } from 'lucide-react'
import { getShopHeader } from '@/lib/shop-data'
import { verifyCertificate } from '@/lib/assessments-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serial: string }>
}): Promise<Metadata> {
  const { serial } = await params
  return {
    title: `Certificate ${decodeURIComponent(serial).toUpperCase()} — StudEasy`,
    /*
     * Not indexed. Public to anyone holding the serial is not the same as
     * wanting a person's certificates to turn up in a search for their name.
     */
    robots: { index: false },
  }
}

export default async function VerifyResultPage({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params
  const code = decodeURIComponent(serial).toUpperCase()

  const [header, certificate] = await Promise.all([
    getShopHeader(),
    verifyCertificate(code),
  ])

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-24">
        {certificate ? (
          <>
            <ShieldCheck size={30} aria-hidden className="text-accent" strokeWidth={1.6} />
            <h1 className="mt-5 text-[clamp(1.8rem,5vw,2.6rem)] leading-[1.1] font-extrabold tracking-tight text-ink">
              This certificate is genuine
            </h1>

            <dl className="mt-9 flex flex-col gap-6 rounded-2xl border border-hairline bg-base-raised p-7">
              <Row term="Awarded for" value={certificate.title} />
              <Row term="Held by" value={certificate.holder} />
              <Row
                term="Issued"
                value={new Date(certificate.issuedAt).toLocaleDateString('en-NZ', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              />
              <Row term="Issued by" value={certificate.organization} />
              <Row term="Serial" value={code} mono />
            </dl>
          </>
        ) : (
          <>
            <ShieldX size={30} aria-hidden className="text-[#E88A8A]" strokeWidth={1.6} />
            <h1 className="mt-5 text-[clamp(1.8rem,5vw,2.6rem)] leading-[1.1] font-extrabold tracking-tight text-ink">
              No certificate with that serial
            </h1>
            <p className="mt-5 text-[1rem] leading-relaxed font-light text-ink-dim">
              We hold nothing under <span className="font-mono text-ink">{code}</span>.
              Check for a mistyped character — serials are twelve characters and contain
              no spaces.
            </p>
          </>
        )}

        <Link
          href="/verify"
          className="mt-9 inline-block rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink hover:border-ink/40"
        >
          Check another
        </Link>
      </main>

      <Footer />
    </>
  )
}

function Row({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[0.74rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
        {term}
      </dt>
      <dd
        className={`mt-1.5 text-[1.05rem] text-ink ${
          mono ? 'font-mono tracking-[0.12em]' : 'font-medium'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
