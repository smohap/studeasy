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
