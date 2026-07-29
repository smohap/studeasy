'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { fadeUp, stagger, VIEWPORT, useMotionOff } from '@/lib/motion'

const BODY =
  "A free diagnostic tells us exactly where your child is. From there, every lesson, worksheet and revision plan is built around their actual gaps — marked overnight, reviewed by their tutor, and explained to you in plain English. No guessing, no 'he's doing fine'."

const STATS = [
  { value: '96%', label: 'Attendance' },
  { value: '88%', label: 'Homework completion' },
  { value: '74% → 81%', label: 'Accuracy in one term' },
  { value: '3.5 hrs', label: 'Per week returned to tutors' },
]

function Word({
  children,
  progress,
  range,
}: {
  children: string
  progress: MotionValue<number>
  range: [number, number]
}) {
  // Resting state is 0.4, not the reference 0.2: at large display sizes that
  // still clears 3:1 against #0C0C0C mid-reveal.
  const opacity = useTransform(progress, range, [0.4, 1])
  return (
    <motion.span style={{ opacity }} className="mr-[0.28em] inline-block">
      {children}
    </motion.span>
  )
}

export default function HowItWorks() {
  const off = useMotionOff()
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.2'],
  })

  const words = BODY.split(' ')

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-36"
    >
      <motion.h2
        id="how-heading"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        className="text-gradient display text-[clamp(3rem,13vw,11rem)]"
      >
        How it works
      </motion.h2>

      <p
        ref={ref}
        className="mt-12 max-w-4xl text-[clamp(1.35rem,3.1vw,2.4rem)] leading-[1.35] font-light text-ink"
      >
        {off
          ? BODY
          : words.map((word, i) => (
              <Word
                key={`${word}-${i}`}
                progress={scrollYProgress}
                range={[i / words.length, (i + 1) / words.length]}
              >
                {word}
              </Word>
            ))}
      </p>

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        className="mt-16 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {STATS.map((s) => (
          <motion.li
            key={s.label}
            variants={fadeUp}
            className="rounded-2xl border border-hairline bg-base-raised p-5 sm:p-7"
          >
            <p className="text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold tracking-tight text-accent">
              {s.value}
            </p>
            <p className="mt-2 text-[0.85rem] leading-snug font-light text-ink-dim">
              {s.label}
            </p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
