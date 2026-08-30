import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { hasRole } from '@/lib/roles'
import { getShopHeader } from '@/lib/shop-data'
import { getTopic, listReplies } from '@/lib/classes-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'
import TopicThread from './TopicThread'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const topic = await getTopic(id)
  return {
    title: topic ? `${topic.title} — StudEasy` : 'Question — StudEasy',
    // Class discussions are private; keeping them out of the index is the least
    // we can do on top of the row-level policy.
    robots: topic?.scope === 'class' ? { index: false } : undefined,
  }
}

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [header, { userId, profile }, topic] = await Promise.all([
    getShopHeader(),
    getCurrentUser(),
    getTopic(id),
  ])

  if (!topic) notFound()

  const replies = await listReplies(id)

  // Teachers can also accept on their own class threads; accept_forum_reply()
  // enforces that, and the button follows the two common cases.
  const canAccept = topic.author_id === userId || hasRole(profile, 'admin')

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <TopicThread
          topic={topic}
          replies={replies}
          canAccept={canAccept}
          signedIn={Boolean(userId)}
        />
      </main>

      <Footer />
    </>
  )
}
