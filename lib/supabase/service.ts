import { createClient as createAdminClient } from '@supabase/supabase-js'
import { DB_SCHEMA, SUPABASE_URL } from './config'

/**
 * Service-role Supabase client — bypasses row-level security.
 *
 * ONLY for trusted server-side work that arrives with no user session, and so
 * has no RLS identity to act under: the Stripe webhook, and the scheduled jobs
 * under /api/cron. Never import this into anything a browser reaches, and never
 * expose StudEasy_SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.
 *
 * Every route that uses it has to do its own authorisation first — this client
 * will happily do whatever it is asked.
 */
export function createServiceClient() {
  const key = process.env.StudEasy_SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !key) {
    throw new Error(
      'This needs NEXT_PUBLIC_StudEasy_SUPABASE_URL and StudEasy_SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return createAdminClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: DB_SCHEMA },
  })
}
