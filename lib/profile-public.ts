import { createClient, isAuthConfigured } from '@/lib/supabase/server'

/**
 * The columns supabase/public-site.sql adds to `profiles`.
 *
 * Read on its own rather than folded into getCurrentUser(), because that
 * query runs on every authenticated request in the app. Selecting a column
 * that does not exist yet fails the whole select, which would sign everybody
 * out of every portal until the migration is applied. Here, a failure costs
 * one panel on one page.
 */
export type PublicProfileFields = {
  headline: string | null
  bio: string | null
  qualifications: string | null
  yearsExperience: number | null
  listed: boolean
  shareProgressConsent: boolean
}

export async function getPublicProfileFields(
  userId: string,
): Promise<PublicProfileFields | null> {
  if (!isAuthConfigured) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('headline, bio, qualifications, years_experience, listed, share_progress_consent')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('public profile fields unavailable:', error.message)
    return null
  }

  return {
    headline: (data.headline as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    qualifications: (data.qualifications as string | null) ?? null,
    yearsExperience: (data.years_experience as number | null) ?? null,
    listed: Boolean(data.listed),
    shareProgressConsent: Boolean(data.share_progress_consent),
  }
}
