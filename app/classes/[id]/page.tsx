import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getShopHeader } from '@/lib/shop-data'
import {
  getClassCounts,
  getClassSession,
  getMyRegistration,
  listClassMaterials,
  listClassTopics,
} from '@/lib/classes-data'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'
import ClassRoom from './ClassRoom'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const session = await getClassSession(id)
  if (!session) return { title: 'Class — StudEasy' }
  return {
    title: `${session.title} — StudEasy`,
    description:
      session.topics ?? `A ${session.subject} class with ${session.teacher_name}.`,
  }
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [header, { userId, profile }, session] = await Promise.all([
    getShopHeader(),
    getCurrentUser(),
    getClassSession(id),
  ])

  if (!session) notFound()

  const [counts, registration] = await Promise.all([
    getClassCounts(id),
    getMyRegistration(id),
  ])

  /*
   * Mirrors in_class_room() in supabase/classes-forum.sql. The database is
   * still the one enforcing it — this only decides which panel to render, so a
   * locked room can explain itself instead of showing an empty list.
   */
  const inRoom =
    profile?.role === 'admin' ||
    session.teacher_id === userId ||
    Boolean(
      registration?.status === 'confirmed' &&
        registration.code_entered_at &&
        (session.status === 'in_progress' || session.status === 'completed'),
    )

  const [materials, topics] = inRoom
    ? await Promise.all([listClassMaterials(id), listClassTopics(id)])
    : [[], []]

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <ClassRoom
          session={session}
          registration={registration}
          seatsLeft={Math.max(session.capacity - counts.taken, 0)}
          waitlistLeft={Math.max(session.waitlist_cap - counts.waitlisted, 0)}
          materials={materials}
          topics={topics}
          signedIn={Boolean(userId)}
          inRoom={inRoom}
        />
      </main>

      <Footer />
    </>
  )
}
