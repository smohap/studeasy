import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteHeader, listSubjectStats, listTutors } from '@/lib/site-data'
import { listCourses } from '@/lib/shop-data'
import { BOARDS, subjectSlug } from '@/lib/curriculum'
import { formatPrice } from '@/lib/catalog'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Cta, Empty, Pill, Section, Stat } from '@/components/site/Ui'
import CourseCard from '@/components/shop/CourseCard'
import TutorCard from '@/components/site/TutorCard'

type Params = { params: Promise<{ slug: string }> }

/*
 * The subject is resolved from the same list the index page renders, so a URL
 * only exists for a subject somebody actually teaches. Guessing
 * /subjects/astrophysics 404s rather than rendering an empty page that implies
 * we teach it.
 */
async function resolve(slug: string) {
  const stats = await listSubjectStats()
  return stats.find((s) => subjectSlug(s.subject) === slug) ?? null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const stat = await resolve((await params).slug)
  if (!stat) return { title: 'Subject not found — StudEasy' }

  return {
    title: `${stat.subject} tutoring — StudEasy`,
    description: `${stat.subject} tutoring for NCEA, Cambridge, IB and CBSE. ${stat.tutorCount} approved tutors and ${stat.courseCount} published courses.`,
  }
}

export default async function SubjectPage({ params }: Params) {
  const { slug } = await params
  const stat = await resolve(slug)
  if (!stat) notFound()

  const [courses, tutors, { signedIn }] = await Promise.all([
    listCourses({ subject: stat.subject }),
    listTutors(),
    getSiteHeader(),
  ])

  const subjectTutors = tutors.filter((t) => t.subjects.includes(stat.subject))

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Subject"
        title={stat.subject}
        intro={`Taught by ${stat.tutorCount} approved ${
          stat.tutorCount === 1 ? 'tutor' : 'tutors'
        } across ${stat.courseCount} published ${
          stat.courseCount === 1 ? 'course' : 'courses'
        }. Everything below is live — book it today.`}
      >
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat value={String(stat.tutorCount)} label="Approved tutors" />
          <Stat value={String(stat.courseCount)} label="Published courses" />
          <Stat value={String(stat.classCount)} label="Live classes" />
          <Stat
            value={stat.fromCents === null ? '—' : formatPrice(stat.fromCents)}
            label={stat.fromCents === null ? 'Nothing listed yet' : 'From'}
          />
        </div>
      </PageHeader>

      <Section id="courses" title="Courses">
        {courses.length === 0 ? (
          <Empty
            title={`No ${stat.subject} courses are published yet`}
            body="A tutor teaches this subject, but nothing is on the catalog for it right now. Ask us and we will tell you what is coming."
            action={{ href: '/contact', label: 'Ask about this subject' }}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <li key={c.id}>
                <CourseCard course={c} signedIn={signedIn} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="tutors" title={`Who teaches ${stat.subject}`}>
        {subjectTutors.length === 0 ? (
          <Empty
            title="No approved tutor lists this subject"
            body="Courses in this subject exist, but nobody currently listed teaches it directly. That usually means the tutor has opted out of the public directory."
            action={{ href: '/tutors', label: 'See every tutor' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjectTutors.map((t) => (
              <li key={t.id}>
                <TutorCard tutor={t} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Levels covered"
        lead="Each course states the board and level it is written for. Filter by level on the course itself."
      >
        <div className="flex flex-wrap gap-2">
          {BOARDS.flatMap((b) => b.levels.map((l) => `${b.name} ${l}`)).map((l) => (
            <Pill key={l}>{l}</Pill>
          ))}
        </div>
        <p className="mt-6 text-[0.9rem] font-light text-ink-dim">
          Sitting something not on this list?{' '}
          <Link href="/contact" className="text-accent hover:underline">
            Tell us which board
          </Link>{' '}
          and we will say honestly whether we can help.
        </p>
      </Section>

      <Cta
        title={`Start with a free ${stat.subject} diagnostic`}
        body="One session, no charge, and a written summary of exactly which standards your child is losing marks on."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/subjects', label: 'All subjects' }}
      />
    </SiteShell>
  )
}
