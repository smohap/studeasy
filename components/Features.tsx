'use client'

import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { fadeUp, stagger, VIEWPORT } from '@/lib/motion'

const FEATURES = [
  {
    n: '01',
    title: 'AI Study Coach',
    body: "Answers homework questions 24/7, using your tutor's own explanations, not a generic internet answer.",
  },
  {
    n: '02',
    title: 'Predictive Grades',
    body: 'See the likely NCEA grade in eight weeks, and exactly which topics move the needle.',
  },
  {
    n: '03',
    title: 'Homework Scanner',
    body: 'Photograph handwritten work and get it marked, with hints, before the next lesson.',
  },
  {
    n: '04',
    title: 'Plain-English Reports',
    body: "A short note after every lesson: what improved, what's still shaky. Not a wall of percentages.",
  },
  {
    n: '05',
    title: 'Online or In Person',
    body: 'Interactive whiteboard, recorded and searchable lessons, or your local tutoring room.',
  },
  {
    n: '06',
    title: 'Book and Pay in a Tap',
    body: 'Stripe, POLi, card or bank transfer. Automatic invoices.',
  },
]

export default function Features() {
  return (
    <section
      aria-labelledby="features-heading"
      className="rounded-t-[60px] bg-white px-5 py-24 text-[#101010] sm:px-8 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <motion.h2
          id="features-heading"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="display max-w-4xl text-[clamp(2.4rem,7vw,5.5rem)] text-[#101010]"
        >
          What you actually get
        </motion.h2>

        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="mt-16 border-t border-black/10"
        >
          {FEATURES.map((f) => (
            <motion.li
              key={f.n}
              variants={fadeUp}
              className="group grid grid-cols-1 gap-2 border-b border-black/10 py-8 transition-colors duration-300 hover:bg-black/[0.02] sm:grid-cols-[5rem_1fr] sm:gap-8 md:grid-cols-[5rem_18rem_1fr]"
            >
              <span
                aria-hidden
                className="text-[0.85rem] font-medium tracking-[0.16em] text-accent-deep"
              >
                {f.n}
              </span>
              <h3 className="text-[clamp(1.25rem,2.4vw,1.75rem)] leading-tight font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="max-w-xl text-[0.98rem] leading-relaxed font-light text-[#4A5157]">
                {f.body}
              </p>
            </motion.li>
          ))}
        </motion.ol>

        {/* The trust boundary, stated once and in full. */}
        <motion.aside
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="mt-14 flex flex-col gap-4 rounded-3xl border border-accent-deep/25 bg-[#FBF6E8] p-7 sm:flex-row sm:items-start sm:gap-6 sm:p-9"
        >
          <ShieldCheck
            size={26}
            aria-hidden
            className="shrink-0 text-accent-deep"
            strokeWidth={1.6}
          />
          <div>
            <h3 className="text-[1.15rem] font-semibold tracking-tight">
              Where the AI gets its answers
            </h3>
            <p className="mt-2 max-w-3xl text-[0.98rem] leading-relaxed font-light text-[#3E444A]">
              Every AI feature on this page is grounded in our own curriculum, worksheets
              and your tutor's explanations — not an open-ended chatbot. Reports are
              AI-drafted and tutor-reviewed before you see them, and no student's work is
              used to train shared or public models.
            </p>
          </div>
        </motion.aside>
      </div>
    </section>
  )
}
