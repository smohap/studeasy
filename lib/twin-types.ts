// Grade is the student-level NCEA outcome and is deliberately distinct from
// GradeBand in lib/taxonomy-types.ts, which tags a single question. A grade
// adds 'not_achieved' — an outcome a question band never carries on its own.
export type Grade = 'not_achieved' | 'achieved' | 'merit' | 'excellence'
export type Confidence = 'low' | 'moderate' | 'high'

export type MasteryRow = {
  topic_id: string
  topic_name: string
  topic_code: string | null
  parent_id: string | null
  mastery: number
  seen_count: number
  correct_count: number
  blank_rate: number
  median_seconds: number | null
  last_seen_at: string | null
}

export type Lever = { topic_id: string; name: string; mastery: number }

export type Projection = {
  topic_id: string
  standard_code: string | null
  standard_name: string
  credits: number | null
  current_grade: Grade
  projected_grade: Grade
  confidence: Confidence
  /** Questions seen for this standard, read from evidence.seen. */
  seen: number
  levers: Lever[]
  tutor_note: string | null
  released_to_parent: boolean
  computed_at: string
}
