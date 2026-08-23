import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
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
   * A first Google sign-in creates an account with no role yet. This page used
   * to redirect those accounts to /register/complete, which made the marketing
   * site unreachable for them: every way back here bounced straight out again,
   * carrying the URL fragment with it. /auth/callback already routes them to
   * registration, so the second gate was redundant — and it could undo the
   * sign-out behind that screen's "Back to home". A nudge does the job without
   * trapping anyone.
   */
  const needsOnboarding = Boolean(userId) && !profile?.role

  return (
    <>
      {needsOnboarding && (
        <aside className="fixed inset-x-0 bottom-0 z-[55] border-t border-accent/30 bg-base-raised/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
            <p className="text-[0.9rem] font-light text-ink-dim">
              Your account is not finished — we still need to know whether you are a
              student, a parent or a tutor.
            </p>
            <Link
              href="/register/complete"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[0.86rem] font-medium text-[#100c00]"
            >
              Finish setting up
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </aside>
      )}

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
