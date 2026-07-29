import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Marquee from '../components/Marquee'
import HowItWorks from '../components/HowItWorks'
import Features from '../components/Features'
import PortalShowcase from '../components/PortalShowcase'
import Results from '../components/Results'
import BookingCta from '../components/BookingCta'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-[0.9rem] focus:font-medium focus:text-[#100c00]"
      >
        Skip to content
      </a>

      <Nav />

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
