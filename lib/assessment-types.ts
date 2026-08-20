/**
 * Client-safe half of the assessment module — types and the question-kind
 * catalogue. lib/assessments-data.ts imports next/headers for its queries, so
 * anything a 'use client' component needs lives here instead. Same split as
 * lib/lesson-types.ts.
 */

export type QuestionKind =
  | 'mcq'
  | 'multi_select'
  | 'true_false'
  | 'fill_blank'
  | 'numerical'
  | 'matching'
  | 'ordering'
  | 'short_answer'
  | 'essay'
  | 'image'
  | 'formula'

export type Assessment = {
  id: string
  title: string
  description: string | null
  course_id: string | null
  time_limit_minutes: number | null
  attempts_allowed: number
  pass_mark_pct: number
  negative_marking: boolean
  issues_certificate: boolean
  status: 'draft' | 'published' | 'archived'
}

/** A question as a student sees it — get_paper() strips `correct`. */
export type PaperQuestion = {
  id: string
  sort_order: number
  kind: QuestionKind
  prompt: string
  image_path: string | null
  marks: number
  payload: { options?: string[]; tolerance?: number }
}

export type AttemptResult = {
  auto_marks: number
  max_marks: number
  needs_marking: boolean
  passed: boolean | null
}

export type Certificate = {
  id: string
  title: string
  serial: string
  issued_at: string
}

/**
 * Which kinds the builder can author today. The database and get_paper()
 * accept all eleven from PRD section 11; matching, ordering, image and formula
 * need their own editors, which do not exist yet.
 */
export const AUTHORABLE_KINDS: {
  value: QuestionKind
  label: string
  marking: 'auto' | 'manual'
  hint: string
}[] = [
  { value: 'mcq', label: 'Multiple choice', marking: 'auto', hint: 'One right answer.' },
  {
    value: 'multi_select',
    label: 'Multiple select',
    marking: 'auto',
    hint: 'Several right answers; all must be picked.',
  },
  { value: 'true_false', label: 'True or false', marking: 'auto', hint: '' },
  {
    value: 'numerical',
    label: 'Numerical',
    marking: 'auto',
    hint: 'Marked within a tolerance you set.',
  },
  {
    value: 'fill_blank',
    label: 'Fill the blank',
    marking: 'auto',
    hint: 'List every wording you would accept, one per line.',
  },
  {
    value: 'short_answer',
    label: 'Short answer',
    marking: 'manual',
    hint: 'You mark this one.',
  },
  { value: 'essay', label: 'Essay', marking: 'manual', hint: 'You mark this one.' },
]

export const KIND_LABEL: Record<QuestionKind, string> = {
  mcq: 'Multiple choice',
  multi_select: 'Multiple select',
  true_false: 'True or false',
  fill_blank: 'Fill the blank',
  numerical: 'Numerical',
  matching: 'Matching',
  ordering: 'Ordering',
  short_answer: 'Short answer',
  essay: 'Essay',
  image: 'Image-based',
  formula: 'Formula',
}

export function isAutoMarked(kind: QuestionKind): boolean {
  return !['short_answer', 'essay', 'image'].includes(kind)
}
