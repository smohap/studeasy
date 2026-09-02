import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { listSubjectStats } from '@/lib/site-data'
import { BOARDS, subjectSlug } from '@/lib/curriculum'
import { formatPrice } from '@/lib/catalog'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Card, Cta, Empty, Pill, Section } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'Subjects — StudEasy',
  description:
    'Mathematics, Physics, Chemistry, Biology, Statistics and Calculus, taught against NCEA, Cambridge, IB and CBSE. Every subject page shows the tutors and courses actually available.',
}

/*
 * PRD §4: "Subject pages are dynamic — driven by curriculum data so new
 * subjects/levels don't require a code change." So the list is not a constant
 * here: it is whatever subjects approved tutors teach or published courses
 * cover. Add a course in a new subject and the page grows a card by itself.
 */
export default async function SubjectsPage() {
  const subjects = await listSubjectStats()

  return (
    <SiteShell>
      <PageHeader
        eyebrow="What we teach"
        title="Subjects"
        intro="Maths and science, from Year 9 through to Level 3 and A Level. Each subject below has at least one approved tutor or a published course — nothing is listed that you could not book today."
      />

      <Section>
        {subjects.length === 0 ? (
          <Empty
            title="No subjects are listed yet"
            body="A subject appears here as soon as an approved tutor teaches it or a course in it is published. Nothing has been published yet."
            action={{ href: '/contact', label: 'Ask us what is coming' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <li key={s.subject}>
                <Link
                  href={`/subjects/${subjectSlug(s.subject)}`}
                  className="block h-full rounded-2xl border border-hairline bg-base-raised p-6 transition-colors hover:border-ink/30"
                >
                  <h2 className="text-[1.25rem] font-semibold tracking-tight text-ink">
                    {s.subject}
                  </h2>

                  <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[0.86rem] font-light text-ink-dim">
                    <div>
                      <dt className="inline">Tutors </dt>
                      <dd className="inline font-normal text-ink">{s.tutorCount}</dd>
                    </div>
                    <div>
                      <dt className="inline">Courses </dt>
                      <dd className="inline font-normal text-ink">{s.courseCount}</dd>
                    </div>
                    {s.classCount > 0 && (
                      <div>
                        <dt className="inline">Live classes </dt>
                        <dd className="inline font-normal text-ink">{s.classCount}</dd>
                      </div>
                    )}
                  </dl>

                  <p className="mt-5 flex items-center gap-2 text-[0.88rem] font-light text-accent">
                    {s.fromCents === null
                      ? 'No courses listed yet'
                      : `From ${formatPrice(s.fromCents)}`}
                    <ArrowRight size={14} aria-hidden />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Qualifications we teach against"
        lead="A tutor picks the board and level a course is written for, so what you see on a subject page is scoped to the exam your child actually sits."
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {BOARDS.map((b) => (
            <li key={b.name}>
              <Card className="h-full">
                <h3 className="text-[1.1rem] font-semibold tracking-tight text-ink">
                  {b.name}
                </h3>
                <p className="mt-2 text-[0.9rem] leading-relaxed font-light text-ink-dim">
                  {b.note}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {b.levels.map((l) => (
                    <Pill key={l}>{l}</Pill>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <Cta
        title="Not sure which level to start at?"
        body="The free diagnostic places your child against the standard they are actually sitting, not the one their year group says they should be."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/courses', label: 'Browse all courses' }}
      />
    </SiteShell>
  )
}
