import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listAssessmentsForTeacher } from '@/lib/assessments-data'
import { listClassesForTeacher } from '@/lib/classes-data'
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
  const [assessments, classes, { data: courses }] = await Promise.all([
    listAssessmentsForTeacher(),
    listClassesForTeacher(),
    supabase.from('courses').select('id, title').eq('teacher_id', userId),
  ])

  return (
    <AssessmentBuilder
      assessments={assessments}
      courses={(courses ?? []) as { id: string; title: string }[]}
      // Cancelled classes are left out — linking an assessment to one nobody
      // will attend just makes it unreachable.
      classes={classes
        .filter((c) => c.session.status !== 'cancelled')
        .map((c) => ({ id: c.session.id, title: c.session.title }))}
    />
  )
}
