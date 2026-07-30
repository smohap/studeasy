import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { COURSE_FIELDS, type Course } from '@/lib/catalog'
import { destinationFor } from '@/lib/roles'
import { DEMO_COURSES } from '@/mock/catalog'

/**
 * Everything the public catalog pages need, in one place. Each returns empty
 * rather than throwing when Supabase is unconfigured, so the pages still render
 * and say the catalog is unavailable.
 */

export async function getShopHeader() {
  const { userId, profile } = await getCurrentUser()
  let cartCount = 0

  if (isAuthConfigured && userId) {
    const supabase = await createClient()
    const { count } = await supabase
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    cartCount = count ?? 0
  }

  return {
    signedIn: Boolean(userId),
    portalHref: userId ? destinationFor(profile) : '/sign-in',
    cartCount,
  }
}

/**
 * Same gate as the dev profile stub in lib/supabase/server: development build
 * AND no credentials. A Vercel deployment is always NODE_ENV=production, and
 * configuring Supabase disables it, so demo rows cannot reach a real catalog.
 */
const DEV_CATALOG = process.env.NODE_ENV === 'development' && !isAuthConfigured

export async function listCourses(opts: { q?: string; subject?: string } = {}) {
  if (DEV_CATALOG) {
    const term = opts.q?.trim().toLowerCase()
    return DEMO_COURSES.filter((c) => {
      const bySubject =
        !opts.subject || opts.subject === 'All subjects' || c.subject === opts.subject
      const byTerm =
        !term ||
        c.title.toLowerCase().includes(term) ||
        c.teacher_name.toLowerCase().includes(term) ||
        (c.summary ?? '').toLowerCase().includes(term)
      return bySubject && byTerm
    })
  }
  if (!isAuthConfigured) return [] as Course[]

  const supabase = await createClient()
  let query = supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .eq('status', 'published')
    .order('rating_count', { ascending: false })

  if (opts.subject && opts.subject !== 'All subjects') {
    query = query.eq('subject', opts.subject)
  }
  if (opts.q?.trim()) {
    const term = `%${opts.q.trim()}%`
    query = query.or(`title.ilike.${term},summary.ilike.${term},teacher_name.ilike.${term}`)
  }

  const { data, error } = await query
  if (error) {
    console.error('Catalog query failed:', error.message)
    return [] as Course[]
  }
  return (data ?? []) as Course[]
}

export async function getCourse(slug: string) {
  if (DEV_CATALOG) return DEMO_COURSES.find((c) => c.slug === slug) ?? null
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .eq('slug', slug)
    .maybeSingle()

  return (data as Course) ?? null
}

export type CartLine = { id: string; course: Course }

export async function getCart(): Promise<CartLine[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('cart_items')
    .select(`id, course:courses(${COURSE_FIELDS})`)
    .eq('user_id', userId)
    .order('added_at')

  // Supabase types the embedded relation loosely; the shape is a single row.
  return ((data ?? []) as unknown as CartLine[]).filter((l) => l.course)
}

export async function getMyEnrolments() {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('enrolments')
    .select(`id, status, progress_pct, course:courses(${COURSE_FIELDS})`)
    .eq('student_id', userId)
    .order('enrolled_at', { ascending: false })

  return (data ?? []) as unknown as {
    id: string
    status: string
    progress_pct: number
    course: Course
  }[]
}
