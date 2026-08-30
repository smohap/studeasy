import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getTeacherAssignments } from '@/lib/assignments'
import { listClassesForTeacher } from '@/lib/classes-data'
import { formatWhen } from '@/lib/class-types'
import { EmptyState } from '@/components/app/Ui'
import AssignmentStudio, { type ParentOption } from './AssignmentStudio'

export const metadata = { title: 'Assignments — StudEasy', robots: { index: false } }

export default async function TutorAssignmentsPage() {
  const { userId, profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/classes-followup.sql to use this."
      />
    )
  }

  const supabase = await createClient()
  const [assignments, classes, { data: courses }] = await Promise.all([
    getTeacherAssignments(),
    listClassesForTeacher(),
    supabase.from('courses').select('id, title').eq('teacher_id', userId),
  ])

  const parents: ParentOption[] = [
    ...((courses ?? []) as { id: string; title: string }[]).map((c) => ({
      value: `course:${c.id}`,
      label: c.title,
      group: 'Courses' as const,
    })),
    // Cancelled classes are left out — setting work for a class that is not
    // running would only confuse whoever was registered for it.
    ...classes
      .filter((c) => c.session.status !== 'cancelled')
      .map((c) => ({
        value: `class:${c.session.id}`,
        label: `${c.session.title} — ${formatWhen(c.session.starts_at, c.session.ends_at)}`,
        group: 'Classes' as const,
      })),
  ]

  return <AssignmentStudio assignments={assignments} parents={parents} />
}
