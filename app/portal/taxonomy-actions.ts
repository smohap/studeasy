'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { GradeBand } from '@/lib/taxonomy-types'

export type Result = { error: string | null }

/**
 * Replaces a question's tags in one go, via studeasy.set_question_topics.
 * That function does the update-delete-insert in one transaction — doing it
 * here as three separate calls left a window where a delete could land and
 * the following insert fail, wiping a question's tags instead of replacing
 * them. RLS and the role check inside the function decide whether the
 * caller may write; this only shapes the request.
 */
export async function setQuestionTopics(
  questionId: string,
  topicIds: string[],
  band: GradeBand | null,
  difficulty: number | null,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }
  if (difficulty !== null && (difficulty < 1 || difficulty > 5)) {
    return { error: 'Difficulty runs from 1 to 5.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('set_question_topics', {
    question: questionId,
    topic_ids: topicIds,
    band,
    difficulty,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/topics')
  return { error: null }
}

/** A tutor sub-topic. Curriculum, level and subject are inherited by trigger. */
export async function createSubTopic(
  parentId: string,
  name: string,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }
  if (!name.trim()) return { error: 'Give the sub-topic a name.' }

  const supabase = await createClient()

  const { data: parent, error: parentError } = await supabase
    .from('topics')
    .select('curriculum_id, level_id, subject')
    .eq('id', parentId)
    .single()
  if (parentError || !parent) return { error: 'That standard no longer exists.' }

  const { error } = await supabase
    .from('topics')
    .insert({
      curriculum_id: parent.curriculum_id,
      level_id: parent.level_id,
      subject: parent.subject,
      parent_id: parentId,
      organization_id: profile.organization_id,
      name: name.trim(),
    })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/topics')
  return { error: null }
}
