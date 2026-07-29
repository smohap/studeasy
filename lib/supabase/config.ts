/**
 * Supabase wiring, in one place.
 *
 * The variable names carry the `StudEasy_` prefix because the Supabase project
 * is shared — the same Vercel/Supabase account holds other projects, and
 * unprefixed names would collide.
 *
 * Referenced as static `process.env.X` member expressions so Next can inline
 * the NEXT_PUBLIC_ values at build time. Do not rewrite these as dynamic
 * lookups.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_StudEasy_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_StudEasy_SUPABASE_ANON_KEY

/**
 * StudEasy owns its own Postgres schema rather than sharing `public` with
 * whatever else lives in the project.
 *
 * This only works if `studeasy` is added to Supabase → Settings → API →
 * "Exposed schemas". PostgREST will not serve a schema that is not listed,
 * and every query will fail with a schema-not-found error until it is.
 */
export const DB_SCHEMA = 'studeasy'

/** False when the deployment has no credentials — the site still runs. */
export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
