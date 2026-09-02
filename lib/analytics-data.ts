import { createClient, isAuthConfigured } from '@/lib/supabase/server'

export type MonthPoint = { month: string; cents: number; orders?: number }

export type AdminAnalytics = {
  people: {
    students: number
    parents: number
    tutors: number
    tutors_pending: number
  }
  catalog: {
    courses_published: number
    courses_draft: number
    courses_in_review: number
    classes_upcoming: number
  }
  activity: {
    enrolments: number
    class_registrations: number
    attempts_30d: number
    help_open: number
    marking_waiting: number
  }
  revenue: {
    paid_cents: number
    paid_orders: number
    refunded_cents: number
    pending_orders: number
    payouts_owed_cents: number
    monthly: MonthPoint[]
  }
}

export type TutorAnalytics = {
  courses: { published: number; draft: number }
  classes: { upcoming: number; held: number }
  students: number
  marking: { waiting: number }
  assessments: {
    submitted: number
    passed: number
    /** Null when nothing has been marked — not the same as zero. */
    pass_rate_pct: number | null
  }
  rating: { reviews: number; average: number | null }
  earnings: { paid_cents: number; owed_cents: number; monthly: MonthPoint[] }
}

/**
 * Platform totals. Null when the caller is not an administrator: the function
 * raises rather than returning a smaller number, so a failure here means
 * "refused", never "quietly incomplete".
 */
export async function getAdminAnalytics(): Promise<AdminAnalytics | null> {
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_analytics')
  if (error) {
    console.error('admin_analytics failed:', error.message)
    return null
  }
  return (data as AdminAnalytics) ?? null
}

/** The signed-in teacher's own numbers. */
export async function getTutorAnalytics(): Promise<TutorAnalytics | null> {
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tutor_analytics')
  if (error) {
    console.error('tutor_analytics failed:', error.message)
    return null
  }
  return (data as TutorAnalytics) ?? null
}
