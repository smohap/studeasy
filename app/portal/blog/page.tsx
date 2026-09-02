import { redirect } from 'next/navigation'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { destinationFor, hasRole } from '@/lib/roles'
import { SUBJECT_FILTERS } from '@/lib/catalog'
import { EmptyState } from '@/components/app/Ui'
import PostEditor, { type MyPost } from './PostEditor'

export const metadata = { title: 'Writing — StudEasy', robots: { index: false } }

/*
 * Where the public blog and the Resources guides are written.
 *
 * Open to active tutors and administrators, not to a single role, because both
 * publish here and the RLS policy on `articles` says exactly the same thing.
 */
export default async function Page() {
  const { userId, profile } = await getCurrentUser()
  if (!userId || !profile) redirect('/sign-in?next=/portal/blog')

  if (!hasRole(profile, 'tutor') && !hasRole(profile, 'admin')) {
    redirect(destinationFor(profile))
  }

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables and run supabase/public-site.sql to write posts."
      />
    )
  }

  /*
   * The RLS policy returns published posts to everyone plus the caller's own
   * drafts. Filtering to author_id here narrows that to "mine" — an admin
   * would otherwise see every published post in their own editing list and be
   * one click from rewriting somebody else's work by accident.
   */
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, slug, title, summary, body, subject, year_level, kind, cover_emoji, status, published_at')
    .eq('author_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    return (
      <EmptyState
        title="Could not load your posts"
        body="The articles table is unavailable. This usually means supabase/public-site.sql has not been run against this database yet."
      />
    )
  }

  const posts: MyPost[] = (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? '',
    body: r.body as string,
    subject: (r.subject as string | null) ?? '',
    yearLevel: (r.year_level as string | null) ?? '',
    kind: r.kind as MyPost['kind'],
    coverEmoji: (r.cover_emoji as string | null) ?? '',
    status: r.status as MyPost['status'],
    publishedAt: (r.published_at as string | null) ?? null,
  }))

  return (
    <PostEditor
      posts={posts}
      subjects={SUBJECT_FILTERS.filter((s) => s !== 'All subjects')}
    />
  )
}
