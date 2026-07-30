import { NextResponse, type NextRequest } from 'next/server'
import { createClient, isAuthConfigured } from '@/lib/supabase/server'
import { destinationFor, type Profile } from '@/lib/roles'

/**
 * Google redirects here with an authorisation code. We swap it for a session,
 * then send the visitor wherever their profile says they belong — which is
 * the registration wizard if they have no role yet.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const providerError = searchParams.get('error_description') ?? searchParams.get('error')

  if (providerError) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(providerError)}`,
    )
  }

  if (!code || !isAuthConfigured) {
    return NextResponse.redirect(`${origin}/sign-in`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // The real message is for us, not for a parent staring at a sign-in page.
    console.error('OAuth code exchange failed:', error.message)
    const friendly =
      'We could not finish signing you in. The link may have expired, or it was opened in a different browser from the one that started sign-in. Please try again.'
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(friendly)}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.redirect(`${origin}/sign-in`)

  const { data } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, avatar_url, role, status, student_code, year_level, subjects, teaching_subjects, parent_id',
    )
    .eq('id', user.id)
    .maybeSingle()

  // Only accept an internal path, so the redirect cannot be pointed offsite.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
  const profile = (data as Profile) ?? null
  const target = profile?.role && safeNext ? safeNext : destinationFor(profile)

  return NextResponse.redirect(`${origin}${target}`)
}
