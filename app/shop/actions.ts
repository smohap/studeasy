'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

export type ShopResult = { error: string | null; state?: string }

async function requireClient() {
  if (!isAuthConfigured) throw new Error('The catalog is not configured for this deployment.')
  return createClient()
}

export async function addToCart(courseId: string): Promise<ShopResult> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to add something to your cart.' }

  const supabase = await requireClient()
  const { data, error } = await supabase.rpc('add_to_cart', { course: courseId })
  if (error) return { error: error.message }

  revalidatePath('/cart')
  revalidatePath('/courses')
  return { error: null, state: data as string }
}

export async function removeFromCart(courseId: string): Promise<ShopResult> {
  const supabase = await requireClient()
  const { error } = await supabase.rpc('remove_from_cart', { course: courseId })
  if (error) return { error: error.message }

  revalidatePath('/cart')
  return { error: null }
}

/**
 * Completes the order. No money moves — the database marks it paid so the
 * enrolment flow works end to end, and Stripe replaces that single step.
 */
export async function checkout(): Promise<ShopResult & { reference?: string }> {
  const { userId } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to check out.' }

  const supabase = await requireClient()
  const { data, error } = await supabase.rpc('checkout')
  if (error) return { error: error.message }

  revalidatePath('/cart')
  revalidatePath('/portal/student')
  return { error: null, reference: data as string }
}

export async function submitCourseForReview(courseId: string): Promise<ShopResult> {
  const supabase = await requireClient()
  const { error } = await supabase.rpc('submit_course_for_review', { course: courseId })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/courses')
  revalidatePath('/portal/admin')
  return { error: null }
}

export async function setCourseStatus(courseId: string, next: string): Promise<ShopResult> {
  const supabase = await requireClient()
  const { error } = await supabase.rpc('set_course_status', { course: courseId, next })
  if (error) return { error: error.message }

  revalidatePath('/portal/admin')
  revalidatePath('/courses')
  return { error: null }
}

export type NewCourse = {
  title: string
  subject: string
  level: string
  summary: string
  kind: string
  format: string
  priceDollars: string
}

/** Creates a draft. Publishing is a separate, reviewed step. */
export async function createCourse(input: NewCourse): Promise<ShopResult> {
  const { userId, profile } = await getCurrentUser()
  if (!userId || profile?.role !== 'tutor') {
    return { error: 'Only a teacher can create a course.' }
  }
  if (!input.title.trim()) return { error: 'Give the course a title.' }
  if (!input.subject) return { error: 'Choose a subject.' }

  const price = Math.round(Number(input.priceDollars || '0') * 100)
  if (!Number.isFinite(price) || price < 0) return { error: 'Enter a valid price.' }

  const slug =
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || `course-${Date.now()}`

  const supabase = await requireClient()
  const { error } = await supabase.from('courses').insert({
    organization_id: profile.organization_id,
    teacher_id: userId,
    teacher_name: profile.full_name ?? 'Teacher',
    slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    subject: input.subject,
    level: input.level || null,
    summary: input.summary.trim() || null,
    kind: input.kind,
    format: input.format,
    price_cents: price,
    status: 'draft',
  })

  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/courses')
  return { error: null }
}
