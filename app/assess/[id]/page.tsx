import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAssessment, getAssessmentAccess, getPaper } from '@/lib/assessments-data'
import { getShopHeader } from '@/lib/shop-data'
import { getCurrentUser } from '@/lib/supabase/server'
import ShopNav from '@/components/shop/ShopNav'
import Footer from '@/components/Footer'
import TakePaper from './TakePaper'

export const metadata: Metadata = {
  title: 'Assessment — StudEasy',
  robots: { index: false },
}

export default async function AssessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await getCurrentUser()
  if (!userId) redirect(`/sign-in?next=/assess/${id}`)

  const [header, assessment, paper, access] = await Promise.all([
    getShopHeader(),
    getAssessment(id),
    // get_paper() returns nothing to a caller with no entitlement, so the
    // questions never reach a browser that has not earned them.
    getPaper(id),
    getAssessmentAccess(id),
  ])

  if (!assessment) notFound()

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <h1 className="text-[clamp(1.7rem,4.5vw,2.6rem)] leading-tight font-extrabold tracking-tight text-ink">
          {assessment.title}
        </h1>
        {assessment.description && (
          <p className="mt-4 text-[1rem] leading-relaxed font-light text-ink-dim">
            {assessment.description}
          </p>
        )}

        <div className="mt-10">
          <TakePaper assessment={assessment} paper={paper} access={access} />
        </div>
      </main>

      <Footer />
    </>
  )
}
