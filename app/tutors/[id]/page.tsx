import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Star } from 'lucide-react'
import { getSiteHeader, getTutor } from '@/lib/site-data'
import { listCourses } from '@/lib/shop-data'
import { subjectSlug } from '@/lib/curriculum'
import SiteShell from '@/components/site/SiteShell'
import { Cta, Empty, Section, Stat } from '@/components/site/Ui'
import CourseCard from '@/components/shop/CourseCard'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tutor = await getTutor((await params).id)
  if (!tutor) return { title: 'Tutor not found — StudEasy' }

  const name = tutor.fullName ?? 'StudEasy tutor'
  return {
    title: `${name} — StudEasy tutor`,
    description:
      tutor.headline ??
      `${name} teaches ${tutor.subjects.join(', ') || 'with StudEasy'}.`,
  }
}

export default async function TutorPage({ params }: Params) {
  const { id } = await params
  const tutor = await getTutor(id)

  /*
   * 404 rather than an error page. public_tutor() returns nothing for an id
   * that is not an approved, listed tutor — a pending application, a student's
   * id, or a tutor who has opted out. None of those should be distinguishable
   * from a bad URL, because the difference is itself information about them.
   */
  if (!tutor) notFound()

  const [{ signedIn }, all] = await Promise.all([getSiteHeader(), listCourses()])
  const courses = all.filter((c) => c.teacher_id === tutor.id)

  const name = tutor.fullName ?? 'StudEasy tutor'

  return (
    <SiteShell>
      <header className="mx-auto max-w-6xl px-5 pt-10 pb-10 sm:px-8 sm:pt-16">
        <Link
          href="/tutors"
          className="text-[0.85rem] font-light text-ink-dim hover:text-ink"
        >
          ← All tutors
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-6">
          {tutor.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tutor.avatarUrl}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-24 w-24 place-items-center rounded-full border border-hairline text-[1.6rem] font-medium text-ink-dim"
            >
              {name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? '')
                .join('')}
            </span>
          )}

          <div>
            <h1 className="text-[clamp(2rem,6vw,3.4rem)] font-semibold tracking-tight text-ink">
              {name}
            </h1>
            {tutor.headline && (
              <p className="mt-3 max-w-2xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
                {tutor.headline}
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat value={String(courses.length)} label="Published courses" />
          <Stat
            value={tutor.rating === null ? '—' : tutor.rating.toFixed(1)}
            label={tutor.rating === null ? 'Not rated yet' : 'Average rating'}
          />
          <Stat
            value={String(tutor.ratingCount)}
            label={tutor.ratingCount === 1 ? 'Review' : 'Reviews'}
          />
          <Stat
            value={
              tutor.yearsExperience === null ? '—' : String(tutor.yearsExperience)
            }
            label={
              tutor.yearsExperience === null
                ? 'Experience not stated'
                : 'Years teaching'
            }
          />
        </div>
      </header>

      {tutor.subjects.length > 0 && (
        <Section title="Teaches">
          <ul className="flex flex-wrap gap-2">
            {tutor.subjects.map((s) => (
              <li key={s}>
                <Link
                  href={`/subjects/${subjectSlug(s)}`}
                  className="inline-block rounded-full border border-hairline px-4 py-2 text-[0.88rem] font-light text-ink transition-colors hover:border-ink/40"
                >
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tutor.bio && (
        <Section title="About">
          <div className="max-w-3xl space-y-5">
            {/* Split on blank lines. The body is plain text from a form and is
                never rendered as HTML. */}
            {tutor.bio.split(/\n{2,}/).map((para, i) => (
              <p
                key={i}
                className="text-[1rem] leading-relaxed font-light text-ink-dim"
              >
                {para}
              </p>
            ))}
          </div>
        </Section>
      )}

      {tutor.qualifications && (
        <Section title="Qualifications">
          <p className="max-w-3xl text-[1rem] leading-relaxed font-light text-ink-dim">
            {tutor.qualifications}
          </p>
          <p className="mt-4 flex items-center gap-2 text-[0.85rem] font-light text-ink-dim">
            <Star size={13} className="text-accent" aria-hidden />
            Stated by the tutor at registration. StudEasy approves the account,
            not the certificate.
          </p>
        </Section>
      )}

      <Section title={`Courses by ${name}`}>
        {courses.length === 0 ? (
          <Empty
            title="Nothing published yet"
            body={`${name} is approved to teach but has no published courses on the catalog right now. They may still be taking students directly.`}
            action={{ href: '/contact', label: 'Ask about availability' }}
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

      <Cta
        title={`Work with ${name}`}
        body="Start with the free diagnostic session — it costs nothing and tells you whether this is the right tutor before you pay for anything."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/tutors', label: 'See other tutors' }}
      />
    </SiteShell>
  )
}
