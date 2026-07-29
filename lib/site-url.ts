import { headers } from 'next/headers'

/**
 * Absolute origin for links we ask Supabase to email out (confirmation,
 * password reset). Prefers an explicit NEXT_PUBLIC_SITE_URL so production
 * emails never point at a preview deployment; otherwise derives it from the
 * request.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/+$/, '')

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
