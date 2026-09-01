import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download, ExternalLink, Lock } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/server'
import { getShopHeader } from '@/lib/shop-data'
import { CONTENT_KIND_LABEL, getContentAccess, getContentItem } from '@/lib/content-data'
import { formatMoney } from '@/lib/class-types'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'
import BuyContent from './BuyContent'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const item = await getContentItem(id)
  return {
    title: item ? `${item.title} — StudEasy` : 'Library — StudEasy',
    description: item?.summary ?? undefined,
  }
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [header, { userId }, item] = await Promise.all([
    getShopHeader(),
    getCurrentUser(),
    getContentItem(id),
  ])

  if (!item) notFound()

  /*
   * The listing is public; the goods are not. getContentAccess() mints a signed
   * URL only after can_access_content() passes, so an unpaid visitor gets the
   * description and nothing that resolves to the file.
   */
  const { canAccess, fileUrl } = await getContentAccess(item)

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <Link
          href="/library"
          className="text-[0.86rem] font-light text-ink-dim hover:text-ink"
        >
          ← Back to the library
        </Link>

        <p className="mt-6 text-[0.8rem] font-medium tracking-wide text-accent uppercase">
          {CONTENT_KIND_LABEL[item.kind]}
          {item.subject ? ` · ${item.subject}` : ''}
        </p>
        <h1 className="mt-3 text-[clamp(1.8rem,5vw,2.8rem)] leading-[1.1] font-extrabold tracking-tight text-ink">
          {item.title}
        </h1>
        <p className="mt-3 text-[1rem] font-light text-ink-dim">
          by {item.author_name}
          {item.year_level ? ` · ${item.year_level}` : ''}
        </p>

        {item.summary && (
          <p className="mt-6 text-[1.02rem] leading-relaxed font-light text-ink-dim">
            {item.summary}
          </p>
        )}

        {item.preview && (
          <section className="mt-8 rounded-2xl border border-hairline bg-base-raised p-6">
            <h2 className="text-[0.78rem] font-medium tracking-wide text-ink-dim uppercase">
              Preview
            </h2>
            <p className="mt-3 leading-relaxed font-light whitespace-pre-line text-ink-dim">
              {item.preview}
            </p>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-hairline bg-base-raised p-6">
          <p className="text-[1.4rem] font-semibold text-ink">
            {formatMoney(item.price_cents, item.currency)}
          </p>

          {canAccess ? (
            <div className="mt-5 flex flex-col gap-3">
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-[0.95rem] font-medium text-[#100c00]"
                >
                  <Download size={16} aria-hidden />
                  {item.file_name ?? 'Download'}
                </a>
              )}
              {item.external_url && (
                <a
                  href={item.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-hairline px-6 py-3 text-[0.92rem] font-light text-ink hover:border-ink/40"
                >
                  <ExternalLink size={15} aria-hidden />
                  Open the link
                </a>
              )}
              <p className="text-[0.84rem] font-light text-ink-dim">
                Yours to keep. The download link refreshes each time you open this page.
              </p>
            </div>
          ) : !userId ? (
            <>
              <p className="mt-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                Sign in to {item.price_cents === 0 ? 'open this' : 'buy this'}.
              </p>
              <Link
                href={`/sign-in?next=/library/${item.id}`}
                className="mt-5 block rounded-full bg-accent px-6 py-3 text-center text-[0.92rem] font-medium text-[#100c00]"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 flex items-start gap-2 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                <Lock size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                Buy this once and it stays in your library.
              </p>
              <div className="mt-5">
                <BuyContent
                  contentId={item.id}
                  priceCents={item.price_cents}
                  currency={item.currency}
                />
              </div>
            </>
          )}
        </section>
      </main>

      <Footer />
    </>
  )
}
