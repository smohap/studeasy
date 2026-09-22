export type GradeBand = 'achieved' | 'merit' | 'excellence'

export type Topic = {
  id: string
  parent_id: string | null
  organization_id: string | null
  curriculum_code: string
  level_code: string
  level_name: string
  subject: string
  code: string | null
  name: string
  credits: number | null
  sort: number
}

export type TaggedQuestion = {
  id: string
  position: number
  prompt: string
  kind: string
  marks: number
  grade_band: GradeBand | null
  difficulty: number | null
  topic_ids: string[]
}

/** How much of an assessment has been tagged. Drives the coverage banner. */
export type TagCoverage = {
  total: number
  tagged: number
  banded: number
}
