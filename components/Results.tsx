'use client'

import { motion } from 'framer-motion'
import { fadeUp, stagger, VIEWPORT } from '@/lib/motion'

const RESULTS = [
  {
    move: 'Achieved → Excellence · 1 term',
    quote:
      'She stopped dreading Algebra once she could see exactly which questions she kept getting wrong.',
    who: 'Parent, Year 11 Mathematics',
  },
  {
    move: 'Merit → Excellence · 2 terms',
    quote:
      'The weekly report actually told us something useful instead of just a mark out of 20.',
    who: 'Parent, Year 13 Physics',
  },
]

export default function Results() {
  return (
    <section
      id="results"
      aria-labelledby="results-heading"
      className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-36"
    >
      <motion.h2
        id="results-heading"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        className="text-gradient display text-[clamp(3rem,13vw,11rem)]"
      >
        Results
      </motion.h2>

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        className="mt-14 grid gap-4 md:grid-cols-2"
      >
        {RESULTS.map((r) => (
          <motion.li
            key={r.who}
            variants={fadeUp}
            className="flex flex-col rounded-3xl border border-hairline bg-base-raised p-7 sm:p-10"
          >
            <p className="text-[0.8rem] font-medium tracking-[0.14em] text-accent uppercase">
              {r.move}
            </p>
            <blockquote className="mt-6 grow text-[clamp(1.15rem,2.4vw,1.6rem)] leading-snug font-light text-ink">
              “{r.quote}”
            </blockquote>
            <p className="mt-7 text-[0.9rem] font-light text-ink-dim">— {r.who}</p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
