import type { Metadata } from 'next'
import Link from 'next/link'
import { listArticles, listFreeResources } from '@/lib/site-data'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Card, Cta, Empty, Pill, Section } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'Free resources — StudEasy',
  description:
    'Free notes, worksheets, past papers and study guides published by StudEasy tutors. Everything on this page costs nothing.',
}

const KIND_LABEL: Record<string, string> = {
  notes: 'Notes',
  worksheet: 'Worksheet',
  video: 'Video',
  slides: 'Slides',
  past_paper: 'Past paper',
  other: 'Resource',
}

/*
 * Two sources, one page: free items from the tutor library, and anything a
 * tutor has written up as a guide. Paid library items are deliberately not
 * here — a page headed "Free resources" that turns out to be a price list is a
 * bait, and /library sells them honestly.
 */
export default async function ResourcesPage() {
  const [items, guides] = await Promise.all([
    listFreeResources(60),
    listArticles('guide'),
  ])

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Free to use"
        title="Resources"
        intro="Notes, worksheets and past papers our tutors have chosen to give away. No account needed to look; you will need one to download, so we can tell you when a resource is updated."
      />

      <Section id="guides" title="Study guides">
        {guides.length === 0 ? (
          <Empty
            title="No guides published yet"
            body="Tutors write these. When one publishes a guide it appears here and on the blog."
            action={{ href: '/blog', label: 'Read the blog' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/blog/${g.slug}`}
                  className="block h-full rounded-2xl border border-hairline bg-base-raised p-6 transition-colors hover:border-ink/30"
                >
                  <span aria-hidden className="text-[1.6rem]">
                    {g.coverEmoji ?? '📗'}
                  </span>
                  <h3 className="mt-4 text-[1.05rem] leading-snug font-semibold tracking-tight text-ink">
                    {g.title}
                  </h3>
                  {g.summary && (
                    <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                      {g.summary}
                    </p>
                  )}
                  <p className="mt-4 text-[0.82rem] font-light text-ink-dim">
                    {g.authorName}
                    {g.readMinutes ? ` · ${g.readMinutes} min read` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="downloads"
        title="From the library"
        lead="Free items only. Everything here was uploaded by an approved tutor, who keeps the copyright and can withdraw it."
      >
        {items.length === 0 ? (
          <Empty
            title="Nothing free is published yet"
            body="Tutors decide what to give away and what to sell. When one publishes a free item it appears here automatically."
            action={{ href: '/library', label: 'Browse the full library' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => (
              <li key={r.id}>
                <Link href={`/library/${r.id}`} className="block h-full">
                  <Card className="h-full transition-colors hover:border-ink/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>{KIND_LABEL[r.kind] ?? 'Resource'}</Pill>
                      <span className="rounded-full bg-accent/15 px-3 py-1 text-[0.76rem] font-medium text-accent">
                        Free
                      </span>
                    </div>

                    <h3 className="mt-4 text-[1.05rem] leading-snug font-semibold tracking-tight text-ink">
                      {r.title}
                    </h3>

                    {r.summary && (
                      <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                        {r.summary}
                      </p>
                    )}

                    <p className="mt-4 text-[0.82rem] font-light text-ink-dim">
                      {[r.subject, r.yearLevel].filter(Boolean).join(' · ') ||
                        'All levels'}
                      {' · '}
                      {r.authorName}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Cta
        title="Want something marked, not just read?"
        body="Upload a question you are stuck on and a tutor will work through it. The first diagnostic session is free."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/library', label: 'Browse the full library' }}
      />
    </SiteShell>
  )
}
