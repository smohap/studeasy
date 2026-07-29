'use client'

import { useRef } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { VIEWPORT, fadeUp, useMotionOff } from '@/lib/motion'

type Portal = {
  n: string
  role: string
  line: string
  shots: { src: string; alt: string }[]
}

const PORTALS: Portal[] = [
  {
    n: '01',
    role: 'Student',
    line: '“Kia ora, Aroha” — study streak, homework due, the topics costing marks, and the AI coach on call.',
    shots: [
      {
        src: '/img/portal-student-main.svg',
        alt: "Student portal home: a greeting reading Kia ora Aroha, a study streak counter, three homework tasks due this week, and a list of weak topics led by quadratic equations.",
      },
      {
        src: '/img/portal-student-inset.svg',
        alt: 'The AI study coach chat, answering a question on factorising quadratics with a worked step-by-step explanation.',
      },
    ],
  },
  {
    n: '02',
    role: 'Parent',
    line: 'The plain-English report, the month-by-month trend, and every invoice in one place.',
    shots: [
      {
        src: '/img/portal-parent-main.svg',
        alt: 'Parent portal: an AI-drafted, tutor-reviewed written report for the month, alongside attendance and homework completion figures.',
      },
      {
        src: '/img/portal-parent-inset.svg',
        alt: 'A line chart of accuracy rising over three terms, with paid and outstanding invoices listed beneath.',
      },
    ],
  },
  {
    n: '03',
    role: 'Tutor',
    line: "Today's schedule, a lesson plan drafted in seconds, and the homework waiting to be reviewed.",
    shots: [
      {
        src: '/img/portal-tutor-main.svg',
        alt: "Tutor portal: today's schedule of four lessons, with one-tap attendance marking for each student.",
      },
      {
        src: '/img/portal-tutor-inset.svg',
        alt: 'The AI lesson planner, showing generated objectives, worked examples and a homework set for Year 10 algebra.',
      },
    ],
  },
  {
    n: '04',
    role: 'Admin',
    line: 'Enrolments, tutor utilisation, revenue and the students at risk of leaving.',
    shots: [
      {
        src: '/img/portal-admin-main.svg',
        alt: 'Admin console: enrolment numbers, tutor utilisation percentages and monthly revenue shown as a bar chart.',
      },
      {
        src: '/img/portal-admin-inset.svg',
        alt: 'A churn-risk list naming five students flagged by falling attendance and homework completion.',
      },
    ],
  },
]

function Collage({ shots }: { shots: Portal['shots'] }) {
  return (
    <div className="relative">
      <img
        src={shots[0].src}
        width={1200}
        height={840}
        loading="lazy"
        alt={shots[0].alt}
        className="w-full rounded-2xl border border-hairline"
      />
      <img
        src={shots[1].src}
        width={720}
        height={520}
        loading="lazy"
        alt={shots[1].alt}
        className="absolute -bottom-6 -left-4 w-[46%] rounded-xl border border-hairline shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)] sm:-bottom-8 sm:-left-8"
      />
    </div>
  )
}

function CardBody({ p }: { p: Portal }) {
  return (
    <div className="grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14 lg:p-14">
      <div>
        <p className="text-[0.8rem] font-medium tracking-[0.2em] text-accent">{p.n}</p>
        <h3 className="display mt-3 text-[clamp(2.2rem,5.5vw,4rem)] text-ink">{p.role}</h3>
        <p className="mt-5 max-w-md text-[1rem] leading-relaxed font-light text-ink-dim sm:text-[1.05rem]">
          {p.line}
        </p>
        <a
          href="#book"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink transition-colors hover:border-ink/40"
        >
          See the portal
          <ArrowUpRight size={16} aria-hidden />
        </a>
      </div>
      <Collage shots={p.shots} />
    </div>
  )
}

function StickyCard({
  p,
  i,
  total,
  progress,
}: {
  p: Portal
  i: number
  total: number
  progress: MotionValue<number>
}) {
  const targetScale = 1 - (total - 1 - i) * 0.03
  const scale = useTransform(progress, [i / total, 1], [1, targetScale])

  return (
    <div className="sticky top-0 flex min-h-svh items-center justify-center px-4 sm:px-8">
      <motion.article
        style={{ scale, top: `calc(-8vh + ${i * 26}px)`, willChange: 'transform' }}
        className="relative w-full max-w-6xl overflow-hidden rounded-[32px] border border-hairline bg-base-raised"
      >
        <CardBody p={p} />
      </motion.article>
    </div>
  )
}

export default function PortalShowcase() {
  const off = useMotionOff()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })

  return (
    <section
      aria-labelledby="portals-heading"
      className="bg-base px-0 pt-24 sm:pt-32"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <motion.h2
          id="portals-heading"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-gradient display text-[clamp(2.6rem,10vw,8rem)]"
        >
          Four portals
        </motion.h2>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="mt-6 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim"
        >
          One record of a student's learning, shown four ways — to the student, the
          parent paying for it, the tutor teaching it, and the office running it.
        </motion.p>
      </div>

      {off ? (
        <div className="mx-auto mt-16 flex max-w-6xl flex-col gap-8 px-4 pb-24 sm:px-8">
          {PORTALS.map((p) => (
            <article
              key={p.n}
              className="overflow-hidden rounded-[32px] border border-hairline bg-base-raised"
            >
              <CardBody p={p} />
            </article>
          ))}
        </div>
      ) : (
        <div ref={ref} className="mt-16">
          {PORTALS.map((p, i) => (
            <StickyCard
              key={p.n}
              p={p}
              i={i}
              total={PORTALS.length}
              progress={scrollYProgress}
            />
          ))}
        </div>
      )}
    </section>
  )
}
