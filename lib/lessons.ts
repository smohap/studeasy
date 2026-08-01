import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { COURSE_FIELDS, type Course } from '@/lib/catalog'

export type { ContentType, Lesson, Review } from './lesson-types'

import type { Lesson, Review } from './lesson-types'

/**
 * A course plus its lessons, for the student player. RLS decides what comes
 * back: an enrolled student gets everything, anyone else gets preview lessons
 * only, so this same call safely serves a signed-out visitor.
 */
export async function getCourseWithLessons(slug: string): Promise<{
  course: Course | null
  lessons: Lesson[]
  enrolled: boolean
  completedIds: string[]
}> {
  const empty = { course: null, lessons: [], enrolled: false, completedIds: [] }
  if (!isAuthConfigured) return empty

  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .eq('slug', slug)
    .maybeSingle()

  if (!course) return empty

  const { data: lessons } = await supabase
    .from('lessons')
    .select(
      'id, title, description, position, content_type, external_url, storage_path, body, duration_minutes, is_preview',
    )
    .eq('course_id', (course as Course).id)
    .is('deleted_at', null)
    .order('position')

  const { userId } = await getCurrentUser()
  let enrolled = false
  let completedIds: string[] = []

  if (userId) {
    const { data: enrolment } = await supabase
      .from('enrolments')
      .select('id')
      .eq('course_id', (course as Course).id)
      .eq('student_id', userId)
      .neq('status', 'cancelled')
      .maybeSingle()
    enrolled = Boolean(enrolment)

    const ids = ((lessons ?? []) as Lesson[]).map((l) => l.id)
    if (ids.length > 0) {
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed_at')
        .eq('student_id', userId)
        .in('lesson_id', ids)
      completedIds = ((progress ?? []) as { lesson_id: string; completed_at: string | null }[])
        .filter((p) => p.completed_at)
        .map((p) => p.lesson_id)
    }
  }

  return {
    course: course as Course,
    lessons: (lessons ?? []) as Lesson[],
    enrolled,
    completedIds,
  }
}

/** Lessons a teacher owns, for the editor. */
export async function getLessonsForTeacher(courseId: string) {
  if (!isAuthConfigured) return { course: null as Course | null, lessons: [] as Lesson[] }

  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .eq('id', courseId)
    .maybeSingle()

  const { data: lessons } = await supabase
    .from('lessons')
    .select(
      'id, title, description, position, content_type, external_url, storage_path, body, duration_minutes, is_preview',
    )
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('position')

  return { course: (course as Course) ?? null, lessons: (lessons ?? []) as Lesson[] }
}

export async function getReviews(courseId: string): Promise<Review[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at, student:profiles(full_name)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []) as unknown as Review[]
}
