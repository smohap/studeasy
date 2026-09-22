import { createClient, isAuthConfigured } from '@/lib/supabase/server'
import type { Topic, TaggedQuestion, TagCoverage } from './taxonomy-types'

const TOPIC_COLUMNS =
  'id, parent_id, organization_id, subject, code, name, credits, sort, ' +
  'curricula(code), curriculum_levels(code, name)'

type TopicJoinRow = Omit<Topic, 'curriculum_code' | 'level_code' | 'level_name'> & {
  curricula: { code: string } | null
  curriculum_levels: { code: string; name: string } | null
}

/** Active topics, optionally narrowed to one subject. Empty when unseeded. */
export async function getTopics(subject?: string): Promise<Topic[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  let query = supabase
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('active', true)
    .order('sort', { ascending: true })

  if (subject) query = query.eq('subject', subject)

  const { data, error } = await query
  if (error || !data) return []

  return (data as unknown as TopicJoinRow[]).map((row) => ({
    id: row.id,
    parent_id: row.parent_id,
    organization_id: row.organization_id,
    curriculum_code: row.curricula?.code ?? '',
    level_code: row.curriculum_levels?.code ?? '',
    level_name: row.curriculum_levels?.name ?? '',
    subject: row.subject,
    code: row.code,
    name: row.name,
    credits: row.credits,
    sort: row.sort,
  }))
}

/** Questions on one assessment with their current tags. */
export async function getAssessmentTags(
  assessmentId: string,
): Promise<TaggedQuestion[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('questions')
    .select('id, position, prompt, kind, marks, grade_band, difficulty, question_topics(topic_id)')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true })

  if (error || !data) return []

  return data.map((q) => ({
    id: q.id as string,
    position: q.position as number,
    prompt: q.prompt as string,
    kind: q.kind as string,
    marks: q.marks as number,
    grade_band: q.grade_band as TaggedQuestion['grade_band'],
    difficulty: q.difficulty as number | null,
    topic_ids: ((q.question_topics ?? []) as { topic_id: string }[]).map(
      (t) => t.topic_id,
    ),
  }))
}

/** Coverage counts for the banner. Pure over rows already fetched. */
export function tagCoverage(questions: TaggedQuestion[]): TagCoverage {
  return {
    total: questions.length,
    tagged: questions.filter((q) => q.topic_ids.length > 0).length,
    banded: questions.filter((q) => q.grade_band !== null).length,
  }
}
