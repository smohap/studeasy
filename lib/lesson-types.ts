/**
 * Client-safe half of the lesson module.
 *
 * lib/lessons.ts imports next/headers for its server queries, so anything a
 * client component needs — types and the content-type list — lives here
 * instead. Importing the query module from a 'use client' file pulls
 * next/headers into the browser bundle and fails the build.
 */

export type ContentType =
  | 'video'
  | 'youtube'
  | 'pdf'
  | 'slides'
  | 'image'
  | 'document'
  | 'link'
  | 'text'

export type Lesson = {
  id: string
  title: string
  description: string | null
  position: number
  content_type: ContentType
  external_url: string | null
  storage_path: string | null
  body: string | null
  duration_minutes: number | null
  is_preview: boolean
}

export type Review = {
  id: string
  rating: number
  body: string | null
  created_at: string
  student: { full_name: string | null } | null
}

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'text', label: 'Written notes' },
  { value: 'youtube', label: 'YouTube video' },
  { value: 'video', label: 'Video file' },
  { value: 'pdf', label: 'PDF' },
  { value: 'slides', label: 'Slides' },
  { value: 'image', label: 'Image' },
  { value: 'document', label: 'Document' },
  { value: 'link', label: 'External link' },
]
