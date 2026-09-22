import type { Metadata } from 'next'
import { getSiteStats } from '@/lib/site-data'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Card, Cta, Section, Stat } from '@/components/site/Ui'

export const metadata: Metadata = {
  title: 'About — StudEasy',
  description:
    'StudEasy pairs real tutors with a learning record built from every question a student answers, so families can see the grade each NCEA standard is heading for. Built in New Zealand for NCEA and Cambridge.',
}

const PRINCIPLES = [
  {
    h: 'A tutor teaches. Software does the rest.',
    p: 'Marking, chasing homework, building a revision plan and writing the parent report are the parts of tutoring that eat the evening. Those are the parts we automated. Nobody is taught by a model here.',
  },
  {
    h: 'A parent should not have to ask how it is going.',
    p: 'Marks, attendance and what was covered are on the parent portal the day they happen, written so they can be read without a teaching degree. No termly summary that arrives after the exam.',
  },
  {
    h: 'The database enforces the rules, not the browser.',
    p: 'Who may see a child’s work, who may message whom, who may mark an assessment — every one of those is a policy in Postgres. Bypassing the front end gets you nothing, because the front end was never the thing saying no.',
  },
  {
    h: 'We would rather show nothing than show a guess.',
    p: 'Every figure on this site is a count of records that exist. Where there is no data yet the page says so. A dashboard of invented numbers is worse than an empty one, because somebody will make a decision on it.',
  },
]

export default async function AboutPage() {
  const stats = await getSiteStats()

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Who we are"
        title="About StudEasy"
        intro="StudEasy is a New Zealand tutoring platform for maths and science, Years 9 to 13. Real tutors do the teaching. Everything around the teaching — the marking, the revision plan, the reporting — is done by software, so the tutor spends the hour on the child rather than on paperwork."
      >
        {stats && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat value={String(stats.tutors)} label="Approved tutors" />
            <Stat value={String(stats.students)} label="Students enrolled" />
            <Stat value={String(stats.subjects)} label="Subjects taught" />
            <Stat
              value={String(stats.assessments_marked)}
              label="Assessments marked"
            />
          </div>
        )}
      </PageHeader>

      <Section title="What we believe" >
        <div className="grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((c) => (
            <Card key={c.h} className="h-full">
              <h3 className="text-[1.08rem] leading-snug font-semibold tracking-tight text-ink">
                {c.h}
              </h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
                {c.p}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title="How a child’s safety is handled"
        lead="This platform has children on it. That constrains a number of design decisions, and it is worth being specific about which."
      >
        <ul className="space-y-4">
          {[
            [
              'Tutors are approved by a person',
              'A tutor can sign in the moment they register, but the tutor portal stays locked until a StudEasy administrator approves the account — because an approved tutor can see a child’s work, marks and messages.',
            ],
            [
              'Messages follow existing relationships',
              'You can message a tutor who teaches you, the parent of a student you teach, or an administrator. Student-to-student direct messaging is not offered, and a cancelled enrolment closes the channel it opened.',
            ],
            [
              'Under-16s need a parent before they can start',
              'A student who registers under 16 can sign in and look around, but nothing they do is recorded until a parent or caregiver linked to them confirms the account. Not a warning banner — the database refuses the write, so no learning record accumulates in the meantime. The parent can withdraw that confirmation at any time.',
            ],
            [
              'Parents are linked by the child’s consent',
              'A parent registers by quoting their child’s Student ID, and the link is completed by the student approving the request. A parent cannot attach themselves to an account unilaterally.',
            ],
            [
              'Nothing is published without being asked',
              'Names never appear in aggregate reporting. The Success Stories page draws only on accounts that explicitly opted in, and consent can be withdrawn at any time.',
            ],
          ].map(([h, p]) => (
            <li
              key={h}
              className="rounded-2xl border border-hairline bg-base-raised p-6"
            >
              <h3 className="text-[1.02rem] font-semibold tracking-tight text-ink">
                {h}
              </h3>
              <p className="mt-3 max-w-3xl text-[0.94rem] leading-relaxed font-light text-ink-dim">
                {p}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="The company">
        <div className="max-w-3xl space-y-5 text-[1rem] leading-relaxed font-light text-ink-dim">
          <p>
            StudEasy is operated by AIDO Technologies Ltd, a New Zealand
            company. Tutoring is delivered face-to-face and online against the
            NCEA, Cambridge, IB and CBSE curricula.
          </p>
          <p>
            Payments are processed by Stripe; StudEasy never sees or stores a
            card number. Course prices are set by the tutor who publishes the
            course, in New Zealand dollars, GST inclusive.
          </p>
          <p>
            If something on this site is wrong, or a figure does not match what
            you see in your own portal, tell us — that is a bug, and we would
            rather hear about it than have you work around it.
          </p>
        </div>
      </Section>

      <Cta
        title="See it with your own child’s work"
        body="The free diagnostic session is the fastest way to judge whether any of the above is true."
        primary={{ href: '/#book', label: 'Book a free session' }}
        secondary={{ href: '/contact', label: 'Talk to us first' }}
      />
    </SiteShell>
  )
}
