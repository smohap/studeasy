'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { ContentType } from '@/lib/lesson-types'

export type Result = { error: string | null }

export type LessonInput = {
  courseId: string
  title: string
  description: string
  contentType: ContentType
  externalUrl: string
  body: string
  durationMinutes: string
  isPreview: boolean
}

/**
 * Creates a lesson. RLS checks the caller owns the course, so a teacher cannot
 * add content to somebody else's.
 */
export async function createLesson(input: LessonInput): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }
  if (!input.title.trim()) return { error: 'Give the lesson a title.' }

  if (input.contentType === 'text' && !input.body.trim()) {
    return { error: 'Written notes need some content.' }
  }
  if (
    ['youtube', 'link', 'video'].includes(input.contentType) &&
    !input.externalUrl.trim()
  ) {
    return { error: 'Paste the link for this lesson.' }
  }

  const supabase = await createClient()

  // Append to the end rather than renumbering everything.
  const { data: last } = await supabase
    .from('lessons')
    .select('position')
    .eq('course_id', input.courseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = ((last as { position: number } | null)?.position ?? -1) + 1

  const { error } = await supabase.from('lessons').insert({
    organization_id: profile.organization_id,
    course_id: input.courseId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    position: nextPosition,
    content_type: input.contentType,
    external_url: input.externalUrl.trim() || null,
    body: input.body.trim() || null,
    duration_minutes: input.durationMinutes ? Number(input.durationMinutes) : null,
    is_preview: input.isPreview,
  })

  if (error) return { error: error.message }

  revalidatePath(`/portal/tutor/courses/${input.courseId}`)
  return { error: null }
}

/** Soft delete, per PRD section 18 — nothing is hard-deleted by the app. */
export async function removeLesson(lessonId: string, courseId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lessons')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', lessonId)

  if (error) return { error: error.message }

  revalidatePath(`/portal/tutor/courses/${courseId}`)
  return { error: null }
}

/** Marks a lesson done and nudges the course's overall progress. */
export async function completeLesson(
  lessonId: string,
  courseId: string,
  courseSlug: string,
): Promise<Result> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  const { error } = await supabase.from('lesson_progress').upsert(
    {
      lesson_id: lessonId,
      student_id: userId,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'lesson_id,student_id' },
  )
  if (error) return { error: error.message }

  // Recompute the enrolment's headline percentage from lessons actually done.
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId)
    .is('deleted_at', null)

  const ids = ((lessons ?? []) as { id: string }[]).map((l) => l.id)
  if (ids.length > 0) {
    const { count } = await supabase
      .from('lesson_progress')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', userId)
      .not('completed_at', 'is', null)
      .in('lesson_id', ids)

    await supabase
      .from('enrolments')
      .update({ progress_pct: Math.round(((count ?? 0) / ids.length) * 100) })
      .eq('course_id', courseId)
      .eq('student_id', userId)
  }

  await supabase.rpc('touch_streak', { award_xp: 10 })

  revalidatePath(`/learn/${courseSlug}`)
  revalidatePath('/portal/student')
  return { error: null }
}

/** Only an enrolled student may review — enforced by the RLS check clause. */
export async function submitReview(
  courseId: string,
  courseSlug: string,
  rating: number,
  body: string,
): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to leave a review.' }
  if (rating < 1 || rating > 5) return { error: 'Choose a rating from 1 to 5.' }

  const supabase = await createClient()
  const { error } = await supabase.from('reviews').upsert(
    {
      organization_id: profile?.organization_id,
      course_id: courseId,
      student_id: userId,
      rating,
      body: body.trim() || null,
    },
    { onConflict: 'course_id,student_id' },
  )

  if (error) {
    // The RLS check is what rejects a non-enrolled reviewer; say so plainly.
    return {
      error: error.message.includes('row-level security')
        ? 'You can only review a course you are enrolled in.'
        : error.message,
    }
  }

  revalidatePath(`/courses/${courseSlug}`)
  return { error: null }
}
