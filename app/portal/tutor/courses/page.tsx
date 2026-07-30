import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { COURSE_FIELDS, type Course } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'
import CourseStudio from './CourseStudio'

export const metadata = { title: 'Course studio — StudEasy', robots: { index: false } }

export default async function TutorCoursesPage() {
  const { userId, profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Catalog not configured"
        body="Add the Supabase environment variables and run supabase/marketplace.sql to use the course studio."
      />
    )
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .eq('teacher_id', userId)
    .order('created_at', { ascending: false })

  return (
    <CourseStudio
      courses={(data ?? []) as Course[]}
      approved={profile?.status === 'active'}
    />
  )
}
