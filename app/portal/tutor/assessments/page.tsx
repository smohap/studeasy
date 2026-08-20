import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listAssessmentsForTeacher } from '@/lib/assessments-data'
import { EmptyState } from '@/components/app/Ui'
import AssessmentBuilder from './AssessmentBuilder'

export const metadata = { title: 'Assessments — StudEasy', robots: { index: false } }

export default async function TutorAssessmentsPage() {
  const { userId, profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/assessments.sql to use this."
      />
    )
  }

  const supabase = await createClient()
  const [assessments, { data: courses }] = await Promise.all([
    listAssessmentsForTeacher(),
    supabase.from('courses').select('id, title').eq('teacher_id', userId),
  ])

  return (
    <AssessmentBuilder
      assessments={assessments}
      courses={(courses ?? []) as { id: string; title: string }[]}
    />
  )
}
