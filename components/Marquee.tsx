'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { useMotionOff } from '@/lib/motion'

const LEVELS = [
  'NCEA Level 1',
  'NCEA Level 2',
  'NCEA Level 3',
  'Cambridge IGCSE',
  'Cambridge A Level',
]

const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Statistics',
  'Calculus',
  'Mechanics',
]

function Row({
  items,
  x,
  accent,
}: {
  items: string[]
  x: MotionValue<string> | undefined
  accent?: boolean
}) {
  // Three passes so the row still covers the viewport at either scroll extreme.
  // Without the transform there is nothing to cover, so the copies are dropped
  // and the row simply wraps.
  const repeated = x ? [...items, ...items, ...items] : items

  return (
    <motion.ul
      style={x ? { x, willChange: 'transform' } : undefined}
      className={x ? 'flex w-max gap-3 sm:gap-4' : 'flex flex-wrap gap-3 sm:gap-4'}
    >
      {repeated.map((item, i) => (
        <li
          key={`${item}-${i}`}
          aria-hidden={i >= items.length || undefined}
          className={`rounded-full border px-6 py-3 text-[clamp(0.9rem,1.5vw,1.15rem)] whitespace-nowrap ${
            accent
              ? 'border-accent/25 bg-accent/[0.06] font-normal text-accent'
              : 'border-hairline bg-base-raised font-light text-ink'
          }`}
        >
          {item}
        </li>
      ))}
    </motion.ul>
  )
}

export default function Marquee() {
  const off = useMotionOff()
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const left = useTransform(scrollYProgress, [0, 1], ['2%', '-22%'])
  const right = useTransform(scrollYProgress, [0, 1], ['-22%', '2%'])

  return (
    <section
      id="subjects"
      ref={ref}
      aria-labelledby="subjects-heading"
      className="overflow-hidden border-y border-hairline py-16 sm:py-24"
    >
      <h2
        id="subjects-heading"
        className="mb-10 px-5 text-[0.75rem] font-normal tracking-[0.22em] text-ink-dim uppercase sm:px-8"
      >
        Levels and subjects we teach
      </h2>

      {/* Reduced motion: rows wrap in place, so nothing needs scrolling to read. */}
      <div className={off ? 'flex flex-col gap-4 px-5 sm:px-8' : 'flex flex-col gap-4'}>
        <Row items={LEVELS} x={off ? undefined : left} accent />
        <Row items={SUBJECTS} x={off ? undefined : right} />
      </div>
    </section>
  )
}
