import Stripe from 'stripe'

/*
 * Re-exported so the webhook's import is unchanged. It moved to lib/supabase
 * once the scheduled jobs needed it too — a service-role client that lives in
 * the Stripe module reads like a Stripe concern, and it is not one.
 */
export { createServiceClient } from './supabase/service'

export const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

/** False when Stripe is not configured — checkout falls back to free enrolment. */
export const isStripeConfigured = Boolean(STRIPE_SECRET)

export function getStripe(): Stripe {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY is not set.')
  return new Stripe(STRIPE_SECRET)
}
