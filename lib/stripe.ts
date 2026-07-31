import Stripe from 'stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

/** False when Stripe is not configured — checkout falls back to free enrolment. */
export const isStripeConfigured = Boolean(STRIPE_SECRET)

export function getStripe(): Stripe {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY is not set.')
  return new Stripe(STRIPE_SECRET)
}

/**
 * Service-role Supabase client — bypasses row-level security.
 *
 * ONLY for the Stripe webhook, which arrives with no user session and so has no
 * RLS identity to act under. Never import this into anything a browser reaches,
 * and never expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_StudEasy_SUPABASE_URL
  const key = process.env.StudEasy_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Webhook needs NEXT_PUBLIC_StudEasy_SUPABASE_URL and StudEasy_SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'studeasy' },
  })
}
