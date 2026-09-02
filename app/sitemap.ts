import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'
import { listArticles, listSubjectStats, listTutors } from '@/lib/site-data'
import { listCourses } from '@/lib/shop-data'
import { subjectSlug } from '@/lib/curriculum'

/*
 * PRD §4 asks for SEO-optimised public pages. The static routes below are the
 * marketing site; the rest is generated, so a new subject, tutor, course or
 * post is in the sitemap the moment it is published rather than the next time
 * somebody remembers to edit a list.
 *
 * Nothing under /portal is here — those pages carry robots: { index: false }
 * and are about individual children.
 */
const STATIC: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1, freq: 'weekly' },
  { path: '/subjects', priority: 0.9, freq: 'weekly' },
  { path: '/courses', priority: 0.9, freq: 'daily' },
  { path: '/tutors', priority: 0.8, freq: 'weekly' },
  { path: '/pricing', priority: 0.8, freq: 'monthly' },
  { path: '/success-stories', priority: 0.7, freq: 'weekly' },
  { path: '/about', priority: 0.6, freq: 'monthly' },
  { path: '/faq', priority: 0.6, freq: 'monthly' },
  { path: '/resources', priority: 0.6, freq: 'weekly' },
  { path: '/blog', priority: 0.6, freq: 'weekly' },
  { path: '/contact', priority: 0.5, freq: 'yearly' },
  { path: '/classes', priority: 0.7, freq: 'daily' },
  { path: '/library', priority: 0.6, freq: 'weekly' },
  { path: '/verify', priority: 0.3, freq: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getSiteUrl()
  const now = new Date()

  /*
   * Every one of these already returns [] rather than throwing when Supabase
   * is unavailable, so a database outage costs the dynamic half of the sitemap
   * and still serves the static half — better than a 500 on a file crawlers
   * fetch repeatedly.
   */
  const [subjects, tutors, courses, posts] = await Promise.all([
    listSubjectStats(),
    listTutors(),
    listCourses(),
    listArticles(),
  ])

  return [
    ...STATIC.map((s) => ({
      url: `${origin}${s.path}`,
      lastModified: now,
      changeFrequency: s.freq,
      priority: s.priority,
    })),
    ...subjects.map((s) => ({
      url: `${origin}/subjects/${subjectSlug(s.subject)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...tutors.map((t) => ({
      url: `${origin}/tutors/${t.id}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...courses.map((c) => ({
      url: `${origin}/courses/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...posts.map((p) => ({
      url: `${origin}/blog/${p.slug}`,
      lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
  ]
}
