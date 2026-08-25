import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { getRoster, listClassMaterials, listClassesForTeacher } from '@/lib/classes-data'
import { EmptyState } from '@/components/app/Ui'
import ClassStudio, { type ClassBundle } from './ClassStudio'

export const metadata = { title: 'Classes — StudEasy', robots: { index: false } }

export default async function TutorClassesPage() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/classes-forum.sql to use this."
      />
    )
  }

  const classes = await listClassesForTeacher()

  // Fans out over the teacher's own classes only — a handful of rows, not the
  // whole catalog.
  const bundles: ClassBundle[] = await Promise.all(
    classes.map(async (c) => ({
      ...c,
      roster: await getRoster(c.session.id),
      materials: await listClassMaterials(c.session.id),
    })),
  )

  return (
    <ClassStudio
      classes={bundles}
      subjects={SUBJECT_FILTERS.filter((s) => s !== 'All subjects')}
    />
  )
}
