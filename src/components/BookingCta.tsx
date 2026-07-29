import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { fadeUp, stagger, VIEWPORT } from '../motion'

const FIELDS = [
  {
    id: 'subject',
    label: 'Subject',
    options: [
      'Mathematics',
      'Physics',
      'Chemistry',
      'Biology',
      'Statistics',
      'Calculus',
      'Mechanics',
    ],
  },
  {
    id: 'level',
    label: 'Year level',
    options: [
      'Year 9',
      'Year 10',
      'Year 11 · NCEA Level 1',
      'Year 12 · NCEA Level 2',
      'Year 13 · NCEA Level 3',
      'Cambridge IGCSE',
      'Cambridge A Level',
    ],
  },
  {
    id: 'mode',
    label: 'Online or in person',
    options: ['Online', 'In person', 'Either is fine'],
  },
]

export default function BookingCta() {
  const [note, setNote] = useState('')

  return (
    <section
      id="book"
      aria-labelledby="book-heading"
      className="mx-auto max-w-6xl px-5 pt-8 pb-24 sm:px-8 sm:pb-32"
    >
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        className="rounded-[40px] border border-hairline bg-base-raised p-7 sm:p-12 lg:p-16"
      >
        <motion.h2
          id="book-heading"
          variants={fadeUp}
          className="text-gradient display max-w-3xl text-[clamp(2.4rem,7.5vw,5.5rem)]"
        >
          Book a free assessment
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim"
        >
          Forty-five minutes, no charge, no obligation. You get a written summary of where
          your child is now and what the first term would cover.
        </motion.p>

        <motion.form
          variants={fadeUp}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setNote('This is a preview of the booking form — nothing has been sent.')
          }}
          className="mt-12 grid gap-4 md:grid-cols-3"
        >
          {FIELDS.map((f) => (
            <div key={f.id} className="flex flex-col gap-2">
              <label
                htmlFor={f.id}
                className="text-[0.78rem] font-normal tracking-[0.16em] text-ink-dim uppercase"
              >
                {f.label}
              </label>
              <div className="relative">
                <select
                  id={f.id}
                  name={f.id}
                  defaultValue=""
                  className="w-full appearance-none rounded-2xl border border-hairline bg-base px-5 py-4 pr-12 text-[0.98rem] font-light text-ink"
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={17}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-ink-dim"
                />
              </div>
            </div>
          ))}

          <div className="md:col-span-3">
            <button
              type="submit"
              className="w-full rounded-full bg-accent px-8 py-4 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] md:w-auto"
            >
              Book a free assessment
            </button>
            <p role="status" aria-live="polite" className="mt-4 text-[0.9rem] font-light text-ink-dim">
              {note}
            </p>
          </div>
        </motion.form>
      </motion.div>
    </section>
  )
}
