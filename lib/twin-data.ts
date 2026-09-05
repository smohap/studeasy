import { createClient, isAuthConfigured } from '@/lib/supabase/server'
import type { MasteryRow, Projection } from './twin-types'

/** Mastery for one student. RLS decides whether the caller may see it. */
export async function getMastery(studentId: string): Promise<MasteryRow[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topic_mastery')
    .select(
      'topic_id, mastery, seen_count, correct_count, blank_rate, median_seconds, ' +
        'last_seen_at, topics(name, code, parent_id)',
    )
    .eq('profile_id', studentId)
    .order('mastery', { ascending: true })

  if (error || !data) return []

  type Row = {
    topic_id: string
    mastery: number
    seen_count: number
    correct_count: number
    blank_rate: number
    median_seconds: number | null
    last_seen_at: string | null
    topics: { name: string; code: string | null; parent_id: string | null } | null
  }

  return (data as unknown as Row[]).map((row) => ({
    topic_id: row.topic_id,
    topic_name: row.topics?.name ?? '',
    topic_code: row.topics?.code ?? null,
    parent_id: row.topics?.parent_id ?? null,
    mastery: Number(row.mastery),
    seen_count: row.seen_count,
    correct_count: row.correct_count,
    blank_rate: Number(row.blank_rate),
    median_seconds: row.median_seconds,
    last_seen_at: row.last_seen_at,
  }))
}

/** Projections for one student. A parent gets only the released ones — RLS. */
export async function getProjections(studentId: string): Promise<Projection[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('standard_projections')
    .select(
      'topic_id, current_grade, projected_grade, confidence, levers, evidence, ' +
        'tutor_note, released_to_parent, computed_at, topics(name, code, credits)',
    )
    .eq('profile_id', studentId)

  if (error || !data) return []

  type Row = {
    topic_id: string
    current_grade: Projection['current_grade']
    projected_grade: Projection['projected_grade']
    confidence: Projection['confidence']
    levers: Projection['levers'] | null
    evidence: { seen?: number } | null
    tutor_note: string | null
    released_to_parent: boolean
    computed_at: string
    topics: { name: string; code: string | null; credits: number | null } | null
  }

  return (data as unknown as Row[]).map((row) => ({
    topic_id: row.topic_id,
    standard_code: row.topics?.code ?? null,
    standard_name: row.topics?.name ?? '',
    credits: row.topics?.credits ?? null,
    current_grade: row.current_grade,
    projected_grade: row.projected_grade,
    confidence: row.confidence,
    seen: row.evidence?.seen ?? 0,
    levers: row.levers ?? [],
    tutor_note: row.tutor_note,
    released_to_parent: row.released_to_parent,
    computed_at: row.computed_at,
  }))
}
