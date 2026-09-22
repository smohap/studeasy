import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'

/**
 * Everything the public marketing pages read, in one place.
 *
 * Every function here returns empty — never a fabricated row — when Supabase
 * is unconfigured or the query fails. The pages are written to say so. That is
 * a deliberate repeat of the decision in lib/shop-data.ts: a directory that
 * invents six tutors looks populated in development and is a lie in
 * production, and a tutor directory is the worst place to lie, because a
 * parent reads it as a recommendation.
 *
 * The functions it calls live in supabase/public-site.sql. They are all
 * SECURITY DEFINER, because `profiles` is readable only by its owner, their
 * parent, or an admin — a signed-out visitor can reach none of it directly.
 */

// ---------------------------------------------------------------------------
// Shared page chrome
// ---------------------------------------------------------------------------

export type SiteHeader = {
  signedIn: boolean
  portalHref: string
}

/** Lets the nav say "My portal" instead of "Sign in" without a client round trip. */
export async function getSiteHeader(): Promise<SiteHeader> {
  const { userId, profile } = await getCurrentUser()
  return {
    signedIn: Boolean(userId),
    portalHref: userId ? destinationFor(profile) : '/sign-in',
  }
}

// ---------------------------------------------------------------------------
// Site-wide counts
// ---------------------------------------------------------------------------

export type SiteStats = {
  tutors: number
  students: number
  courses: number
  subjects: number
  classes_upcoming: number
  resources_free: number
  assessments_marked: number
  /** Null when nothing has been rated. Not the same as a rating of zero. */
  rating: number | null
}

export async function getSiteStats(): Promise<SiteStats | null> {
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('site_stats')
  if (error) {
    console.error('site_stats failed:', error.message)
    return null
  }
  return data as SiteStats
}

// ---------------------------------------------------------------------------
// Tutors
// ---------------------------------------------------------------------------

export type PublicTutor = {
  id: string
  fullName: string | null
  avatarUrl: string | null
  headline: string | null
  subjects: string[]
  yearsExperience: number | null
  courseCount: number
  /** Weighted mean over their rated courses; null when none are rated. */
  rating: number | null
  ratingCount: number
  joinedAt: string
}

export type PublicTutorDetail = PublicTutor & {
  bio: string | null
  qualifications: string | null
}

type TutorRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
  headline: string | null
  teaching_subjects: string[] | null
  years_experience: number | null
  course_count: number
  rating: number | string | null
  rating_count: number
  joined_at: string
  bio?: string | null
  qualifications?: string | null
}

/*
 * Postgres `numeric` arrives over PostgREST as a string, not a number — it is
 * arbitrary precision, and JSON has no way to say so. Parsing it here rather
 * than at each call site means no page ever calls toFixed() on a string.
 */
function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function toTutor(r: TutorRow): PublicTutor {
  return {
    id: r.id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    headline: r.headline,
    subjects: r.teaching_subjects ?? [],
    yearsExperience: r.years_experience,
    courseCount: Number(r.course_count ?? 0),
    rating: toNumber(r.rating),
    ratingCount: Number(r.rating_count ?? 0),
    joinedAt: r.joined_at,
  }
}

export async function listTutors(): Promise<PublicTutor[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_tutors')
  if (error) {
    console.error('public_tutors failed:', error.message)
    return []
  }
  return ((data ?? []) as TutorRow[]).map(toTutor)
}

/**
 * Null for an id that is not an approved, listed tutor — including a real one
 * who has opted out, which is why the page 404s rather than erroring.
 */
export async function getTutor(id: string): Promise<PublicTutorDetail | null> {
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_tutor', { p_id: id })
  if (error) {
    console.error('public_tutor failed:', error.message)
    return null
  }
  const rows = (data ?? []) as TutorRow[]
  if (rows.length === 0) return null

  return {
    ...toTutor(rows[0]),
    bio: rows[0].bio ?? null,
    qualifications: rows[0].qualifications ?? null,
  }
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export type SubjectStat = {
  subject: string
  courseCount: number
  classCount: number
  tutorCount: number
  rating: number | null
  /** Cheapest published price in the subject, in cents. Null when nothing is listed. */
  fromCents: number | null
}

export async function listSubjectStats(): Promise<SubjectStat[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_subject_stats')
  if (error) {
    console.error('public_subject_stats failed:', error.message)
    return []
  }

  return (
    (data ?? []) as {
      subject: string
      course_count: number
      class_count: number
      tutor_count: number
      rating: number | string | null
      from_cents: number | null
    }[]
  ).map((r) => ({
    subject: r.subject,
    courseCount: Number(r.course_count ?? 0),
    classCount: Number(r.class_count ?? 0),
    tutorCount: Number(r.tutor_count ?? 0),
    rating: toNumber(r.rating),
    fromCents: r.from_cents,
  }))
}

// ---------------------------------------------------------------------------
// Success stories
// ---------------------------------------------------------------------------

export type Testimonial = {
  id: string
  rating: number
  body: string
  subject: string | null
  /** The only thing identifying the author, and deliberately so. */
  yearLevel: string | null
  writtenAt: string
}

export type ProgressStory = {
  subject: string
  yearLevel: string | null
  firstPct: number
  latestPct: number
  attempts: number
  spanDays: number
}

export async function listTestimonials(limit = 12): Promise<Testimonial[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_testimonials', { p_limit: limit })
  if (error) {
    console.error('public_testimonials failed:', error.message)
    return []
  }

  return (
    (data ?? []) as {
      id: string
      rating: number
      body: string
      subject: string | null
      year_level: string | null
      written_at: string
    }[]
  ).map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    subject: r.subject,
    yearLevel: r.year_level,
    writtenAt: r.written_at,
  }))
}

export async function listProgressStories(limit = 8): Promise<ProgressStory[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_progress_stories', {
    p_limit: limit,
  })
  if (error) {
    console.error('public_progress_stories failed:', error.message)
    return []
  }

  return (
    (data ?? []) as {
      subject: string
      year_level: string | null
      first_pct: number | string
      latest_pct: number | string
      attempts: number
      span_days: number
    }[]
  ).map((r) => ({
    subject: r.subject,
    yearLevel: r.year_level,
    firstPct: toNumber(r.first_pct) ?? 0,
    latestPct: toNumber(r.latest_pct) ?? 0,
    attempts: Number(r.attempts ?? 0),
    spanDays: Number(r.span_days ?? 0),
  }))
}

// ---------------------------------------------------------------------------
// Articles — the blog
// ---------------------------------------------------------------------------

export type ArticleKind = 'article' | 'guide' | 'news'

export type ArticleSummary = {
  id: string
  slug: string
  title: string
  summary: string | null
  subject: string | null
  kind: ArticleKind
  authorName: string
  coverEmoji: string | null
  readMinutes: number | null
  publishedAt: string | null
}

export type Article = ArticleSummary & { body: string; yearLevel: string | null }

const ARTICLE_LIST_FIELDS =
  'id, slug, title, summary, subject, kind, author_name, cover_emoji, read_minutes, published_at'

function toSummary(r: Record<string, unknown>): ArticleSummary {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    kind: r.kind as ArticleKind,
    authorName: r.author_name as string,
    coverEmoji: (r.cover_emoji as string | null) ?? null,
    readMinutes: (r.read_minutes as number | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
  }
}

export async function listArticles(kind?: ArticleKind): Promise<ArticleSummary[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  let query = supabase
    .from('articles')
    .select(ARTICLE_LIST_FIELDS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) {
    console.error('articles query failed:', error.message)
    return []
  }
  return (data ?? []).map(toSummary)
}

export async function getArticle(slug: string): Promise<Article | null> {
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select(`${ARTICLE_LIST_FIELDS}, body, year_level, status`)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('article query failed:', error.message)
    return null
  }
  if (!data) return null

  /*
   * The RLS policy also lets an author read their own draft, which is right
   * for the portal. But a draft must not become reachable at a public URL just
   * because its author happens to be signed in — so this checks the status
   * itself rather than trusting the row it got back.
   */
  if (data.status !== 'published') return null

  return {
    ...toSummary(data),
    body: data.body as string,
    yearLevel: (data.year_level as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Resources — the free half of the tutor library
// ---------------------------------------------------------------------------

export type FreeResource = {
  id: string
  title: string
  summary: string | null
  subject: string | null
  yearLevel: string | null
  kind: string
  authorName: string
}

/**
 * Free published items from the content library. Paid items are deliberately
 * excluded: a page headed "Resources" that turns out to be a price list is a
 * bait, and /library already sells them honestly.
 */
export async function listFreeResources(limit = 60): Promise<FreeResource[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, summary, subject, year_level, kind, author_name')
    .eq('status', 'published')
    .eq('price_cents', 0)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('free resources query failed:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    yearLevel: (r.year_level as string | null) ?? null,
    kind: r.kind as string,
    authorName: r.author_name as string,
  }))
}
