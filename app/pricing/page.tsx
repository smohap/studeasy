import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteStats, listSubjectStats } from '@/lib/site-data'
import { subjectSlug } from '@/lib/curriculum'
import { formatPrice } from '@/lib/catalog'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Card, Cta, Empty, Section, Stat } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'Pricing — StudEasy',
  description:
    'What StudEasy costs: a free diagnostic session, then per-course prices set by the tutor teaching it. No subscription, no lock-in, no joining fee.',
}

/*
 * There is no price list here, because StudEasy does not have one. Tutors set
 * the price of each course they publish, so the honest thing to show is the
 * cheapest price actually on the catalog in each subject — read from the same
 * rows the shop sells from, so this page cannot drift out of date.
 *
 * Inventing three tiers because pricing pages usually have three tiers would
 * mean quoting a price nobody can buy.
 */
export default async function PricingPage() {
  const [stats, subjects] = await Promise.all([getSiteStats(), listSubjectStats()])
  const priced = subjects.filter((s) => s.fromCents !== null)

  return (
    <SiteShell>
      <PageHeader
        eyebrow="What it costs"
        title="Pricing"
        intro="One free diagnostic session, then you pay per course or per class. There is no subscription, no joining fee, and nothing renews on its own."
      >
        {stats && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat value="Free" label="Diagnostic session" />
            <Stat value={String(stats.courses)} label="Courses on the catalog" />
            <Stat value={String(stats.resources_free)} label="Free resources" />
            <Stat value="NZD" label="All prices, GST inclusive" />
          </div>
        )}
      </PageHeader>

      <Section
        id="from"
        title="What courses cost right now"
        lead="The lowest published price in each subject, read from the catalog as this page loaded. Individual courses vary — a full term of live classes is not priced like a set of worksheets."
      >
        {priced.length === 0 ? (
          <Empty
            title="Nothing is priced yet"
            body="Tutors set their own prices when they publish. No course has been published so far, so there is no figure here to quote."
            action={{ href: '/contact', label: 'Ask what it will cost' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {priced.map((s) => (
              <li key={s.subject}>
                <Link
                  href={`/subjects/${subjectSlug(s.subject)}`}
                  className="block h-full rounded-2xl border border-hairline bg-base-raised p-6 transition-colors hover:border-ink/30"
                >
                  <p className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
                    {s.subject}
                  </p>
                  <p className="mt-4 text-[clamp(1.6rem,3.6vw,2.2rem)] font-semibold tracking-tight text-accent">
                    {formatPrice(s.fromCents!)}
                  </p>
                  <p className="mt-2 text-[0.86rem] font-light text-ink-dim">
                    from · {s.courseCount}{' '}
                    {s.courseCount === 1 ? 'course' : 'courses'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="how"
        title="How paying works"
        lead="Four things worth knowing before you spend anything."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              h: 'The first session is free, properly',
              p: 'No card, no trial that starts billing. You get the diagnostic and the written summary of where your child is, and you keep the summary whether or not you carry on.',
            },
            {
              h: 'You buy a course, not a plan',
              p: 'Each course, class or assessment is bought once, through Stripe. Nothing renews automatically, so there is no subscription to remember to cancel.',
            },
            {
              h: 'Tutors set their own prices',
              p: 'StudEasy does not set a rate card. A tutor prices what they publish and keeps the majority of it; the platform fee is deducted at payout, not added to your bill.',
            },
            {
              h: 'Refunds are handled by a person',
              p: 'Email us and a person looks at it, rather than a form deciding. An approved refund goes back through Stripe to the card that paid, and you keep any part of the course we agree you should keep.',
            },
          ].map((c) => (
            <Card key={c.h} className="h-full">
              <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">
                {c.h}
              </h3>
              <p className="mt-3 text-[0.94rem] leading-relaxed font-light text-ink-dim">
                {c.p}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="free"
        title="What costs nothing at all"
        lead="Quite a lot of the platform, in fact."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['The diagnostic session', 'One free session with a tutor, plus the written summary.'],
            ['An account', 'Students, parents and tutors all register free.'],
            ['The forum', 'Ask a question, get an answer from a tutor or another student.'],
            ['Free library items', 'Whatever tutors choose to give away.'],
            ['Progress reports', 'Parents see marks, attendance and reports at no charge.'],
            ['Certificates', 'Issued and verifiable by anyone, free, forever.'],
          ].map(([h, p]) => (
            <li
              key={h}
              className="rounded-2xl border border-hairline bg-base-raised p-5"
            >
              <p className="text-[0.98rem] font-medium text-ink">{h}</p>
              <p className="mt-2 text-[0.88rem] leading-relaxed font-light text-ink-dim">
                {p}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Cta
        title="Start with the free session"
        body="It is the only way to know what your child actually needs, and it costs you nothing to find out."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/faq', label: 'Read the FAQ' }}
      />
    </SiteShell>
  )
}
