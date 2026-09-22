'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { hasRole } from '@/lib/roles'
import { subjectSlug } from '@/lib/curriculum'

export type Result = { error: string | null; slug?: string }

export type PostDraft = {
  id?: string
  title: string
  summary: string
  body: string
  subject: string
  yearLevel: string
  kind: 'article' | 'guide' | 'news'
  coverEmoji: string
  status: 'draft' | 'published' | 'archived'
}

/**
 * Roughly 200 words a minute, floored at one. A stated reading time that is
 * obviously wrong costs more trust than no reading time at all, so this is
 * computed from the text rather than typed by the author.
 */
function readMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/**
 * Create or update a post.
 *
 * The RLS policy on `articles` already refuses anyone who is not an admin or
 * an active tutor, and refuses an author_id that is not the caller. The check
 * below is so the writer gets a sentence instead of a Postgres error — it is
 * not what makes this safe.
 */
export async function savePost(draft: PostDraft): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  if (!userId || !profile) return { error: 'You are not signed in.' }

  if (!hasRole(profile, 'tutor') && !hasRole(profile, 'admin')) {
    return { error: 'Only approved tutors and administrators can publish here.' }
  }

  const title = draft.title.trim()
  if (title.length < 6) return { error: 'Give the post a real title.' }
  if (draft.body.trim().length < 200) {
    return { error: 'A post needs at least a couple of paragraphs.' }
  }

  const supabase = await createClient()

  const row = {
    title,
    summary: draft.summary.trim() || null,
    body: draft.body.trim(),
    subject: draft.subject.trim() || null,
    year_level: draft.yearLevel.trim() || null,
    kind: draft.kind,
    cover_emoji: draft.coverEmoji.trim() || null,
    read_minutes: readMinutes(draft.body),
    status: draft.status,
  }

  if (draft.id) {
    const { error } = await supabase
      .from('articles')
      .update(row)
      .eq('id', draft.id)
    if (error) return { error: error.message }
    revalidatePath('/blog')
    revalidatePath('/portal/blog')
    return { error: null }
  }

  /*
   * The slug is derived from the title and is never changed afterwards, even
   * if the title is. A published URL that moves breaks every link to it, and
   * a blog whose links rot is worse than one with an awkward slug.
   */
  const base = subjectSlug(title).slice(0, 70) || 'post'
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`

  const { error } = await supabase.from('articles').insert({
    ...row,
    slug,
    author_id: userId,
    author_name: profile.full_name ?? 'StudEasy',
  })
  if (error) return { error: error.message }

  revalidatePath('/blog')
  revalidatePath('/portal/blog')
  return { error: null, slug }
}

export async function deletePost(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('articles').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/blog')
  revalidatePath('/portal/blog')
  return { error: null }
}
