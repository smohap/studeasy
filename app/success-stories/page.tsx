import type { Metadata } from 'next'
import { Star } from 'lucide-react'
import { getSiteStats, listProgressStories, listTestimonials } from '@/lib/site-data'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Card, Cta, Empty, Section, Stat } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'Success stories — StudEasy',
  description:
    'Measured improvement from real StudEasy accounts, anonymised and published only with consent, alongside reviews students chose to write.',
}

/*
 * PRD §4: "Success Stories page pulls anonymised before/after grade data from
 * the platform (with parent consent) rather than being manually written."
 *
 * So this page contains no marketing copy about results at all. It shows two
 * things, kept visibly apart because they are not the same kind of claim:
 *
 *   1. Reviews — something a student chose to write and publish.
 *   2. Measured improvement — the platform's own claim about a child's marks,
 *      shown only for accounts that ticked the consent box, and stripped to a
 *      year level and a subject.
 *
 * When either is empty the page says so rather than filling the space. A
 * testimonials page is precisely where invented content does the most damage.
 */
export default async function SuccessStoriesPage() {
  const [stats, stories, testimonials] = await Promise.all([
    getSiteStats(),
    listProgressStories(9),
    listTestimonials(12),
  ])

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Results"
        title="Success stories"
        intro="Nothing on this page was written by us. The figures are computed from marked assessments belonging to families who agreed to share them anonymously; the quotes are reviews students published themselves."
      >
        {stats && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat
              value={String(stats.assessments_marked)}
              label="Assessments marked and returned"
            />
            <Stat value={String(stats.students)} label="Students enrolled" />
            <Stat value={String(stats.tutors)} label="Approved tutors" />
            <Stat
              value={stats.rating === null ? '—' : `${stats.rating.toFixed(1)}/5`}
              label={stats.rating === null ? 'No ratings yet' : 'Average course rating'}
            />
          </div>
        )}
      </PageHeader>

      <Section
        id="progress"
        title="Measured improvement"
        lead="First marked assessment against most recent, same student, same subject, at least three sittings apart. Only accounts that opted in appear here, and only an improvement is shown — a story, by definition, is one that went somewhere."
      >
        {stories.length === 0 ? (
          <Empty
            title="No family has opted in yet"
            body="This section fills itself from marked assessments, but only for accounts that have agreed to share them anonymously. Until somebody does, there is nothing honest to put here."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((s, i) => {
              const gain = Math.round((s.latestPct - s.firstPct) * 10) / 10
              return (
                <li key={`${s.subject}-${i}`}>
                  <Card className="h-full">
                    <p className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
                      {s.subject}
                      {s.yearLevel ? ` · ${s.yearLevel}` : ''}
                    </p>

                    <p className="mt-5 flex items-baseline gap-3 text-[clamp(1.5rem,3.4vw,2.1rem)] font-semibold tracking-tight">
                      <span className="text-ink-dim">{s.firstPct}%</span>
                      <span aria-hidden className="text-ink-dim">→</span>
                      <span className="text-accent">{s.latestPct}%</span>
                    </p>

                    <p className="mt-4 text-[0.88rem] leading-relaxed font-light text-ink-dim">
                      Up {gain} percentage points across {s.attempts} marked
                      assessments
                      {s.spanDays > 0 &&
                        `, over ${
                          s.spanDays < 60
                            ? `${s.spanDays} days`
                            : `${Math.round(s.spanDays / 30)} months`
                        }`}
                      .
                    </p>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-8 max-w-3xl text-[0.86rem] leading-relaxed font-light text-ink-dim">
          No name, student ID, school or course title appears here, and a family
          can withdraw consent at any time from their profile, which removes
          their figures from this page immediately.
        </p>
      </Section>

      <Section
        id="reviews"
        title="What students wrote"
        lead="Course reviews, unedited. Only a student who took the course can leave one, and only reviews of four stars or more are shown here — the rest sit on the course page, where a buyer will see them."
      >
        {testimonials.length === 0 ? (
          <Empty
            title="No reviews yet"
            body="Reviews appear here once students have finished courses and written them. Nothing is placed here on their behalf."
            action={{ href: '/courses', label: 'Browse courses' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <li key={t.id}>
                <Card className="flex h-full flex-col">
                  <p className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        size={14}
                        aria-hidden
                        className={
                          i < t.rating ? 'fill-accent text-accent' : 'text-hairline'
                        }
                      />
                    ))}
                  </p>

                  <blockquote className="mt-4 text-[0.96rem] leading-relaxed font-light text-ink">
                    “{t.body}”
                  </blockquote>

                  <p className="mt-auto pt-5 text-[0.82rem] font-light text-ink-dim">
                    {t.yearLevel ?? 'StudEasy student'}
                    {t.subject ? ` · ${t.subject}` : ''}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Cta
        title="See where your child actually is"
        body="The free diagnostic is the first of the marked assessments these figures are built from. It costs nothing, and you keep the written summary either way."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/subjects', label: 'Browse subjects' }}
      />
    </SiteShell>
  )
}
