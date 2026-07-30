import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = /^\/portal(\/|$)/

/**
 * Refreshes the Supabase session cookie on every matched request, and turns
 * anonymous visitors away from /portal before a page renders.
 *
 * Role checking is not done here — that lives in the portal layout, where the
 * profile is already loaded, and ultimately in the database's row-level
 * security.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_StudEasy_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_StudEasy_SUPABASE_ANON_KEY

  // Without credentials there is no session to refresh and nothing to guard;
  // the pages themselves render an "auth not configured" state.
  if (!url || !key) return response

  /*
   * Forward a stray OAuth result to the callback route.
   *
   * Supabase only redirects to a `redirectTo` that is in its allowlist —
   * otherwise it silently falls back to the project's Site URL and appends the
   * result there. That lands `/?code=...` on the marketing page, which has no
   * way to exchange it, and the sign-in appears to do nothing.
   *
   * Rather than depend on that dashboard setting being right, hand anything
   * carrying an OAuth code or error to /auth/callback, which knows what to do
   * with it.
   */
  const params = request.nextUrl.searchParams
  const path = request.nextUrl.pathname
  const oauthCode = params.get('code')
  const oauthError = params.get('error_description')

  /*
   * Only `code` and Supabase's own `error_description` count. Deliberately not
   * a bare `error` param: /sign-in?error=… is how this app reports a failed
   * exchange, and forwarding that back to the callback loops forever.
   */
  const strayResult =
    path !== '/auth/callback' && (oauthCode || (oauthError && path !== '/sign-in'))

  if (strayResult) {
    const callback = request.nextUrl.clone()
    callback.pathname = '/auth/callback'
    callback.search = ''
    if (oauthCode) callback.searchParams.set('code', oauthCode)
    if (oauthError) callback.searchParams.set('error_description', oauthError)

    // Preserve where they were headed, unless that was just the home page.
    if (path !== '/') callback.searchParams.set('next', path)

    return NextResponse.redirect(callback)
  }

  const supabase = createServerClient(url, key, {
    // Only the session cookie matters here — no table reads, so no schema.
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && PROTECTED.test(request.nextUrl.pathname)) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/sign-in'
    signIn.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(signIn)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
