import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import Marquee from '@/components/Marquee'
import HowItWorks from '@/components/HowItWorks'
import Features from '@/components/Features'
import PortalShowcase from '@/components/PortalShowcase'
import Results from '@/components/Results'
import BookingCta from '@/components/BookingCta'
import Footer from '@/components/Footer'

export default async function HomePage() {
  // Lets the nav say "My portal" instead of "Sign in" without a client round trip.
  const { userId, profile } = await getCurrentUser()

  /*
   * Onboarding gate. A first Google sign-in creates an account with no role, and
   * Supabase drops the visitor on the Site URL — here — whenever the callback
   * URL is not in its redirect allowlist. Without this, that account lands on
   * the marketing page and is never asked for the details registration needs.
   */
  if (userId && !profile?.role) redirect('/register/complete')

  return (
    <>
      <Nav
        signedIn={Boolean(userId)}
        portalHref={userId ? destinationFor(profile) : '/sign-in'}
      />

      <main id="main">
        <Hero />
        <Marquee />
        <HowItWorks />
        <Features />
        <PortalShowcase />
        <Results />
        <BookingCta />
      </main>

      <Footer />
    </>
  )
}
