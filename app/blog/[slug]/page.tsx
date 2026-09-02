import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getArticle, listArticles } from '@/lib/site-data'
import { subjectSlug } from '@/lib/curriculum'
import SiteShell from '@/components/site/SiteShell'
import { Cta, Pill } from '@/components/site/Ui'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = await getArticle((await params).slug)
  if (!post) return { title: 'Post not found — StudEasy' }

  return {
    title: `${post.title} — StudEasy`,
    description: post.summary ?? undefined,
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params
  const post = await getArticle(slug)
  if (!post) notFound()

  const more = (await listArticles())
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3)

  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16">
        <Link
          href="/blog"
          className="text-[0.85rem] font-light text-ink-dim hover:text-ink"
        >
          ← All posts
        </Link>

        <header className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{post.kind === 'guide' ? 'Guide' : post.kind === 'news' ? 'News' : 'Article'}</Pill>
            {post.subject && (
              <Link href={`/subjects/${subjectSlug(post.subject)}`}>
                <Pill>{post.subject}</Pill>
              </Link>
            )}
            {post.yearLevel && <Pill>{post.yearLevel}</Pill>}
          </div>

          <h1 className="mt-6 text-[clamp(2rem,6vw,3.4rem)] leading-[1.08] font-semibold tracking-tight text-ink">
            {post.title}
          </h1>

          <p className="mt-5 text-[0.9rem] font-light text-ink-dim">
            {post.authorName}
            {post.publishedAt ? ` · ${formatDate(post.publishedAt)}` : ''}
            {post.readMinutes ? ` · ${post.readMinutes} min read` : ''}
          </p>

          {post.summary && (
            <p className="mt-7 border-l-2 border-accent/40 pl-5 text-[1.08rem] leading-relaxed font-light text-ink">
              {post.summary}
            </p>
          )}
        </header>

        {/*
          * Paragraphs, split on blank lines. The body is plain text typed into
          * a form by a tutor and is never passed through
          * dangerouslySetInnerHTML — an author with a publish button is not a
          * reason to hand them script execution on the marketing site.
          */}
        <div className="mt-10 space-y-6">
          {post.body.split(/\n{2,}/).map((para, i) => (
            <p
              key={i}
              className="text-[1.05rem] leading-[1.75] font-light text-ink-dim"
            >
              {para}
            </p>
          ))}
        </div>
      </article>

      {more.length > 0 && (
        <section
          aria-labelledby="more-h"
          className="mx-auto max-w-6xl px-5 pb-14 sm:px-8"
        >
          <h2
            id="more-h"
            className="text-[1.3rem] font-semibold tracking-tight text-ink"
          >
            More from the blog
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {more.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="block h-full rounded-2xl border border-hairline bg-base-raised p-5 transition-colors hover:border-ink/30"
                >
                  <h3 className="text-[0.98rem] leading-snug font-semibold tracking-tight text-ink">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-[0.82rem] font-light text-ink-dim">
                    {p.authorName}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Cta
        title="Put it into practice"
        body="A free diagnostic session tells you which of this actually applies to your child."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/courses', label: 'Browse courses' }}
      />
    </SiteShell>
  )
}
