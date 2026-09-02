import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

/**
 * Everything under /portal is somebody's own record — a child's marks, a
 * parent's invoices, a tutor's marking queue. None of it should be crawled,
 * and the pages already carry `robots: { index: false }` individually; this
 * says the same thing before a crawler fetches them.
 *
 * /auth and /cart are excluded because a crawler following them does nothing
 * useful and can burn a one-time code.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getSiteUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/portal/', '/auth/', '/cart', '/wishlist', '/assess/'],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
