import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTopics, getAssessmentTags, tagCoverage } from '@/lib/taxonomy-data'
import { getCurrentUser } from '@/lib/supabase/server'
import { listAssessmentsForTeacher } from '@/lib/assessments-data'
import TopicTagger from './TopicTagger'

export const metadata: Metadata = {
  title: 'Tag questions — StudEasy',
  robots: { index: false },
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>
}) {
  const { profile } = await getCurrentUser()
  if (!profile) redirect('/sign-in')

  const { assessment } = await searchParams
  const assessments = await listAssessmentsForTeacher()
  const selected = assessment ?? assessments[0]?.id ?? null

  const [topics, questions] = await Promise.all([
    getTopics(),
    selected ? getAssessmentTags(selected) : Promise.resolve([]),
  ])

  if (topics.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Tag questions</h1>
        <p className="mt-4 text-slate-600">
          No curriculum topics have been loaded yet. Run{' '}
          <code>supabase/taxonomy.sql</code> to seed the NCEA and Cambridge
          spine, then reload this page.
        </p>
      </main>
    )
  }

  return (
    <TopicTagger
      topics={topics}
      assessments={assessments.map((a) => ({ id: a.id, title: a.title }))}
      selectedAssessment={selected}
      questions={questions}
      coverage={tagCoverage(questions)}
    />
  )
}
