'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { GradeBand } from '@/lib/taxonomy-types'

export type Result = { error: string | null }

/**
 * Replaces a question's tags in one go. Delete-then-insert rather than a diff:
 * the set is small, and a diff that drifts leaves a tag nobody chose.
 * RLS decides whether the caller may write; this only shapes the request.
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

  const { error: bandError } = await supabase
    .from('questions')
    .update({ grade_band: band, difficulty })
    .eq('id', questionId)
  if (bandError) return { error: bandError.message }

  const { error: clearError } = await supabase
    .from('question_topics')
    .delete()
    .eq('question_id', questionId)
  if (clearError) return { error: clearError.message }

  if (topicIds.length > 0) {
    const { error: insertError } = await supabase
      .from('question_topics')
      .insert(topicIds.map((topic_id) => ({ question_id: questionId, topic_id })))
    if (insertError) return { error: insertError.message }
  }

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
