import type { Metadata } from 'next'
import Link from 'next/link'
import { listArticles } from '@/lib/site-data'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Cta, Empty, Pill, Section } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'Blog — StudEasy',
  description:
    'Writing from StudEasy tutors on NCEA and Cambridge maths and science: what examiners actually reward, where marks get lost, and how to revise.',
}

const KIND_LABEL = { article: 'Article', guide: 'Guide', news: 'News' } as const

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function BlogPage() {
  const posts = await listArticles()

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Writing"
        title="Blog"
        intro="Written by the people who do the marking. Every post is signed by an approved tutor or a StudEasy administrator — nobody else can publish here."
      />

      <Section>
        {posts.length === 0 ? (
          <Empty
            title="Nothing published yet"
            body="Posts are written by approved tutors and administrators from inside their portal. None has been published so far."
            action={{ href: '/resources', label: 'Free resources instead' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-hairline bg-base-raised p-6 transition-colors hover:border-ink/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span aria-hidden className="text-[1.6rem]">
                      {p.coverEmoji ?? '📝'}
                    </span>
                    <Pill>{KIND_LABEL[p.kind]}</Pill>
                  </div>

                  <h2 className="mt-4 text-[1.1rem] leading-snug font-semibold tracking-tight text-ink">
                    {p.title}
                  </h2>

                  {p.summary && (
                    <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                      {p.summary}
                    </p>
                  )}

                  <p className="mt-auto pt-5 text-[0.82rem] font-light text-ink-dim">
                    {p.authorName}
                    {p.publishedAt ? ` · ${formatDate(p.publishedAt)}` : ''}
                    {p.readMinutes ? ` · ${p.readMinutes} min read` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Cta
        title="Reading is not the same as practising"
        body="Book the free diagnostic and find out which of these your child actually needs."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/resources', label: 'Free resources' }}
      />
    </SiteShell>
  )
}
