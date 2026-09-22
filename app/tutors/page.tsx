import type { Metadata } from 'next'
import { listTutors } from '@/lib/site-data'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import TutorCard from '@/components/site/TutorCard'
import { Card, Cta, Empty, Section } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'Our tutors — StudEasy',
  description:
    'Every StudEasy tutor is approved by a site administrator before they appear here, because tutors can see students’ work. Browse who teaches what.',
}

export default async function TutorsPage() {
  const tutors = await listTutors()

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Who teaches here"
        title="Our tutors"
        intro="Everyone on this page has been approved by a StudEasy administrator. That check is not a formality: an approved tutor can see a child’s work, their marks and their messages, so nobody is listed until a person has looked at their application."
      />

      <Section>
        {tutors.length === 0 ? (
          <Empty
            title="No tutors are listed yet"
            body="Tutors appear here once an administrator has approved their application. Anyone waiting on that decision is deliberately not shown."
            action={{ href: '/register', label: 'Apply to teach with us' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tutors.map((t) => (
              <li key={t.id}>
                <TutorCard tutor={t} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What approval actually means">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              h: 'A person reviews it',
              p: 'Applications land in a queue in the admin portal. Nobody is approved automatically, and the tutor portal stays locked until they are.',
            },
            {
              h: 'The role cannot be self-assigned',
              p: 'A database trigger rejects any attempt to set your own role or status. The check is in Postgres, not in the browser, so it holds even if the front end is bypassed.',
            },
            {
              h: 'Being listed is optional',
              p: 'An approved tutor can take themselves off this page at any time from their profile. Not appearing here does not mean they are not teaching.',
            },
          ].map((c) => (
            <Card key={c.h} className="h-full">
              <h3 className="text-[1.02rem] font-semibold tracking-tight text-ink">
                {c.h}
              </h3>
              <p className="mt-3 text-[0.92rem] leading-relaxed font-light text-ink-dim">
                {c.p}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Cta
        title="Teach with StudEasy"
        body="Set your own prices, keep your own students, and mark in one queue instead of a pile of paper. Applications are reviewed by a person, usually within two working days."
        primary={{ href: '/register', label: 'Apply to teach' }}
        secondary={{ href: '/contact', label: 'Ask a question first' }}
      />
    </SiteShell>
  )
}
