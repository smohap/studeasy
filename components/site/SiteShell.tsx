import type { ReactNode } from 'react'
import { getSiteHeader } from '@/lib/site-data'
import SiteNav from '@/components/site/SiteNav'
import Footer from '@/components/Footer'

/**
 * Nav, main landmark and footer for every public page except the home page,
 * which composes its own sections around the same nav.
 *
 * Server component: it resolves the signed-in state itself, so no page has to
 * remember to, and the nav never flickers between "Sign in" and "My portal".
 */
export default async function SiteShell({ children }: { children: ReactNode }) {
  const { signedIn, portalHref } = await getSiteHeader()

  return (
    <>
      <SiteNav signedIn={signedIn} portalHref={portalHref} />
      {/* pt clears the fixed header, which is 4.5rem tall at every breakpoint. */}
      <main id="main" className="pt-24 sm:pt-28">
        {children}
      </main>
      <Footer />
    </>
  )
}
