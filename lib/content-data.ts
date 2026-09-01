import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

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
  preview: string | null
  price_cents: number
  currency: string
  status: 'draft' | 'published' | 'archived'
  created_at: string
}

const FIELDS = `id, author_id, author_name, title, summary, subject, year_level, kind,
  file_path, file_name, external_url, preview, price_cents, currency, status, created_at`

/** Everything on sale or given away, newest first. */
export async function listContent(filter?: {
  subject?: string
  q?: string
}): Promise<ContentItem[]> {
  if (!isAuthConfigured) return []
  const supabase = await createClient()

  let query = supabase
    .from('content_items')
    .select(FIELDS)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(60)

  if (filter?.subject) query = query.eq('subject', filter.subject)
  if (filter?.q) {
    query = query.or(
      `title.ilike.%${filter.q}%,summary.ilike.%${filter.q}%,author_name.ilike.%${filter.q}%`,
    )
  }

  const { data } = await query
  return (data ?? []) as ContentItem[]
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  if (!isAuthConfigured) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('content_items')
    .select(FIELDS)
    .eq('id', id)
    .maybeSingle()
  return (data as ContentItem) ?? null
}

/**
 * Whether the caller may open this, and a link if so.
 *
 * The bucket is private, so a stored path is useless on its own — the signed
 * URL is minted only after can_access_content() says yes, which is what keeps
 * a paid worksheet from being one guessed URL away from free.
 */
export async function getContentAccess(
  item: ContentItem,
): Promise<{ canAccess: boolean; fileUrl: string | null }> {
  if (!isAuthConfigured) return { canAccess: false, fileUrl: null }
  const supabase = await createClient()

  const { data: allowed } = await supabase.rpc('can_access_content', { content: item.id })
  if (!allowed) return { canAccess: false, fileUrl: null }

  let fileUrl: string | null = null
  if (item.file_path) {
    const { data: signed } = await supabase.storage
      .from('content-library')
      .createSignedUrl(item.file_path, 60 * 60)
    fileUrl = signed?.signedUrl ?? null
  }

  return { canAccess: true, fileUrl }
}

/** What this author has written, drafts included. */
export async function listMyContent(): Promise<ContentItem[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('content_items')
    .select(FIELDS)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []) as ContentItem[]
}

/** What this student has bought or claimed. */
export async function listMyLibrary(): Promise<ContentItem[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data: owned } = await supabase
    .from('content_purchases')
    .select('content_id')
    .eq('student_id', userId)

  const ids = ((owned ?? []) as { content_id: string }[]).map((p) => p.content_id)
  if (ids.length === 0) return []

  const { data } = await supabase.from('content_items').select(FIELDS).in('id', ids)
  return (data ?? []) as ContentItem[]
}
