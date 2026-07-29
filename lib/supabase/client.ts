import { createBrowserClient } from '@supabase/ssr'

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** False when the deployment has no credentials — the site still runs. */
export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export function createClient() {
  if (!isAuthConfigured) {
    throw new Error('Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_* env vars.')
  }
  return createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
}
