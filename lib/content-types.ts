/**
 * Client-safe half of the content module.
 *
 * lib/content-data.ts imports next/headers for its queries, so anything a
 * 'use client' component needs at runtime — the label map, not just the types —
 * lives here instead. Same split as lib/class-types.ts and
 * lib/assessment-types.ts.
 */

export type ContentKind =
  | 'notes'
  | 'worksheet'
  | 'video'
  | 'slides'
  | 'past_paper'
  | 'other'

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  notes: 'Notes',
  worksheet: 'Worksheet',
  video: 'Video',
  slides: 'Slides',
  past_paper: 'Past paper',
  other: 'Other',
}

export type ContentItem = {
  id: string
  author_id: string | null
  author_name: string
  title: string
  summary: string | null
  subject: string | null
  year_level: string | null
  kind: ContentKind
  file_path: string | null
  file_name: string | null
  external_url: string | null
  /** Shown to everyone, bought or not — nobody pays for a title alone. */
  preview: string | null
  price_cents: number
  currency: string
  status: 'draft' | 'published' | 'archived'
  created_at: string
}
