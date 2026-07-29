'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { EASE, fadeUp, stagger, useMotionOff } from '@/lib/motion'
import { useMagnetic } from '@/lib/useMagnetic'

export default function Hero() {
  const off = useMotionOff()
  const cta = useMagnetic(0.22)
  const device = useMagnetic(0.05)

  return (
    <section id="top" className="relative overflow-hidden px-5 pt-32 pb-20 sm:px-8 sm:pt-40">
      {/* Single soft light source behind the headline. No decorative imagery. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(227,179,65,0.10),transparent_70%)]"
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-5xl text-center"
      >
        <motion.p variants={fadeUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-4 py-1.5 text-[0.78rem] font-normal tracking-wide text-accent">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Free diagnostic assessment this week
          </span>
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="mt-6 text-[0.78rem] font-normal tracking-[0.22em] text-ink-dim uppercase"
        >
          NCEA · Cambridge · Mathematics &amp; Science
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="text-gradient display mt-5 text-[clamp(2.5rem,8.4vw,7rem)]"
        >
          Every student gets their own path to{' '}
          {/* Overrides the clipped gradient fill inherited from the heading. */}
          <span className="[-webkit-text-fill-color:var(--color-accent)] text-accent">
            Excellence.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-8 max-w-2xl text-[clamp(1rem,1.6vw,1.2rem)] leading-relaxed font-light text-ink-dim"
        >
          StudEasy pairs real tutors with an AI Learning Twin for every student — so homework
          gets marked overnight, revision plans write themselves, and parents actually
          understand the report.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <motion.a
            href="#book"
            {...cta.magneticProps}
            style={cta.style}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 text-[0.95rem] font-medium text-[#100c00] sm:w-auto"
          >
            Book a free assessment
            <ArrowRight
              size={17}
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </motion.a>
          <a
            href="#how-it-works"
            className="inline-flex w-full items-center justify-center rounded-full border border-hairline px-8 py-4 text-[0.95rem] font-light text-ink transition-colors hover:border-ink/40 sm:w-auto"
          >
            See how it works
          </a>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.45 }}
        className="mx-auto mt-20 max-w-5xl"
      >
        <motion.div
          {...device.magneticProps}
          style={device.style}
          animate={off ? undefined : { y: [0, -10, 0] }}
          transition={
            off ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut' }
          }
          className="rounded-[26px] border border-hairline bg-base-raised p-2 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:rounded-[34px] sm:p-3"
        >
          <div
            aria-hidden
            className="mx-auto mb-2 h-1 w-24 rounded-full bg-white/10 sm:mb-3"
          />
          <img
            src="/img/student-dashboard.svg"
            width={1600}
            height={1000}
            alt="The StudEasy student dashboard, showing today's lesson, homework due, a study streak and the weakest topics for the week."
            className="w-full rounded-[18px] sm:rounded-[24px]"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
