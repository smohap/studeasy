import type { Metadata } from 'next'
import Link from 'next/link'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Cta, Section } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'FAQ — StudEasy',
  description:
    'Answers about StudEasy: what the free session includes, how tutors are approved, what parents can see, how payment and refunds work, and what happens to your data.',
}

/*
 * Rendered as <details>, not a JavaScript accordion. It opens with scripting
 * off, it is keyboard operable and announced correctly without a single ARIA
 * attribute, and the answers are in the page source for search engines — which
 * PRD §4 asks for.
 */
const GROUPS: { heading: string; qas: [string, string][] }[] = [
  {
    heading: 'Getting started',
    qas: [
      [
        'Is the first session really free?',
        'Yes. No card, no trial that quietly starts billing. You get a diagnostic session with a tutor and a written summary of which standards your child is losing marks on, and you keep that summary whether or not you continue.',
      ],
      [
        'What year levels do you teach?',
        'Years 9 to 13, against NCEA Levels 1 to 3, Cambridge IGCSE and A Level, IB, and CBSE. Subjects are maths and science — the live list is on the Subjects page, and it is generated from what tutors actually teach rather than from a brochure.',
      ],
      [
        'Do you teach online or in person?',
        'Both. Each course states its format: online, in person, hybrid, or self-paced. Live classes have a scheduled time; self-paced courses do not.',
      ],
      [
        'How do I register my child?',
        'Register as a parent using your child’s Student ID, which they are given when they create their account. Your child approves the link from their own portal. You can link more children later from the parent portal.',
      ],
    ],
  },
  {
    heading: 'Tutors',
    qas: [
      [
        'How are tutors vetted?',
        'Every tutor application is reviewed by a StudEasy administrator before the tutor portal unlocks and before they appear in the public directory. An approved tutor can see a child’s work, marks and messages, so nobody is approved automatically.',
      ],
      [
        'Can I choose my tutor?',
        'Yes. Browse the tutors page, read what they teach, and book a course of theirs. If it is not working, you are not locked in — nothing renews automatically.',
      ],
      [
        'Are qualifications verified?',
        'A tutor states their qualifications on their profile. StudEasy approves the account after reviewing the application; we do not hold ourselves out as having certified every certificate, and the tutor page says so.',
      ],
    ],
  },
]

const MORE: { heading: string; qas: [string, string][] }[] = [
  {
    heading: 'Parents',
    qas: [
      [
        'What can I see as a parent?',
        'Your linked child’s marks, attendance, what was covered, their assessment results once released, and their invoices. You cannot read their private messages with a tutor, and you cannot sit their assessments.',
      ],
      [
        'Can I book a class for my child?',
        'Yes. A parent can register a linked child for a class. The platform refuses a booking that clashes with something the child is already registered for, so two tutors cannot be paid for the same hour.',
      ],
      [
        'Will my child appear on your website?',
        'Not unless you have said yes. The Success Stories page shows a year level and a subject and nothing else, and only for accounts that ticked the consent box. Withdraw consent on the profile page and the figures disappear from the site immediately.',
      ],
    ],
  },
  {
    heading: 'Assessments',
    qas: [
      [
        'What happens when the time runs out?',
        'The attempt submits itself. An online assessment cannot be paused, cannot be started after its closing time, and cannot be added to once the clock reaches zero — the deadline is enforced by the database, not by the page you have open.',
      ],
      [
        'Who marks the work?',
        'Multiple-choice, numeric and short-answer questions are marked automatically. Anything needing judgement goes to the tutor’s marking queue, and results are released to the student only when the tutor releases them.',
      ],
      [
        'Are certificates worth anything outside StudEasy?',
        'A certificate carries a serial anyone can check at /verify without an account. It is a record that this platform assessed this person on this date — it is not a national qualification, and we do not describe it as one.',
      ],
    ],
  },
  {
    heading: 'Money and data',
    qas: [
      [
        'How do I pay?',
        'By card, through Stripe, at the point you buy a course. StudEasy never sees or stores your card number. Prices are in New Zealand dollars and include GST.',
      ],
      [
        'What is your refund policy?',
        'Email us and a person will look at it. Refunds are not yet self-service in the portal, and we would rather tell you that than put a button there that does not work.',
      ],
      [
        'What do you do with our data?',
        'It stays in the platform and is used to teach your child. Row-level security limits every read to your own record, your linked children, or an administrator. We do not sell it, and aggregate reporting never carries a name.',
      ],
      [
        'Can I delete my account?',
        'Yes — ask us and we will do it. Deleting an account removes the profile and cascades to the work attached to it, which is why it goes through a person rather than a button somebody presses by accident.',
      ],
    ],
  },
]

export default function FaqPage() {
  const groups = [...GROUPS, ...MORE]

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Questions"
        title="FAQ"
        intro="The things parents ask before booking, answered without hedging. If yours is not here, ask us directly — a person replies."
      />

      {groups.map((g) => (
        <Section key={g.heading} title={g.heading}>
          <div className="divide-y divide-hairline border-y border-hairline">
            {g.qas.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.02rem] font-normal text-ink">
                  {q}
                  <span
                    aria-hidden
                    className="shrink-0 text-ink-dim transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-3xl text-[0.96rem] leading-relaxed font-light text-ink-dim">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Still stuck?">
        <p className="max-w-2xl text-[1rem] leading-relaxed font-light text-ink-dim">
          Write to us and a person will answer. If it is about something already
          in your portal, sign in first and message your tutor directly — it
          gets to the right person faster.{' '}
          <Link href="/contact" className="text-accent hover:underline">
            Contact us
          </Link>
          .
        </p>
      </Section>

      <Cta
        title="Book the free session"
        body="Most of these questions answer themselves once you have seen a diagnostic report for your own child."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/pricing', label: 'See pricing' }}
      />
    </SiteShell>
  )
}
