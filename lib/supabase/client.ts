import { createBrowserClient } from '@supabase/ssr'
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from './config'

export { SUPABASE_URL, SUPABASE_ANON_KEY, isAuthConfigured }

export function createClient() {
  if (!isAuthConfigured) {
    throw new Error(
      'Supabase is not configured. Check NEXT_PUBLIC_StudEasy_SUPABASE_URL and NEXT_PUBLIC_StudEasy_SUPABASE_ANON_KEY.',
    )
  }
  return createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    db: { schema: DB_SCHEMA },
  })
}
