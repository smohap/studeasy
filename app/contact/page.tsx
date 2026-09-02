import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, MessageSquare, ShieldCheck } from 'lucide-react'
import SiteShell from '@/components/site/SiteShell'
import PageHeader from '@/components/site/PageHeader'
import { Card, Section } from '@/components/site/Ui'
import ContactForm from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact — StudEasy',
  description:
    'Ask StudEasy a question about tutoring, billing, teaching with us, or something broken on the site. A person reads and replies.',
}

export default function ContactPage() {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Talk to us"
        title="Contact"
        intro="A person reads these. Tell us the year level, the subject and what is actually going wrong, and you will get an answer rather than a brochure."
      />

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 className="sr-only">Send us a message</h2>
          <ContactForm />
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <p className="flex items-center gap-2.5 text-[1rem] font-medium text-ink">
              <MessageSquare size={16} className="text-accent" aria-hidden />
              Already have an account?
            </p>
            <p className="mt-3 text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Message your tutor directly from the portal. It reaches the person
              who actually teaches your child, and they can see the work you are
              asking about.
            </p>
            <Link
              href="/portal/messages"
              className="mt-4 inline-block text-[0.88rem] font-light text-accent hover:underline"
            >
              Open my inbox
            </Link>
          </Card>

          <Card>
            <p className="flex items-center gap-2.5 text-[1rem] font-medium text-ink">
              <Mail size={16} className="text-accent" aria-hidden />
              What we will do with this
            </p>
            <p className="mt-3 text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Your name, email and message are stored so we can reply, and are
              readable only by a StudEasy administrator. We do not add you to a
              mailing list, and we do not pass it on.
            </p>
          </Card>

          <Card>
            <p className="flex items-center gap-2.5 text-[1rem] font-medium text-ink">
              <ShieldCheck size={16} className="text-accent" aria-hidden />
              Please do not send
            </p>
            <p className="mt-3 text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Passwords, card numbers or your child’s full date of birth. We
              will never ask for any of them by email, and nobody at StudEasy
              needs them to help you.
            </p>
          </Card>
        </aside>
      </section>

      <Section title="Before you write, these might answer it">
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { href: '/faq', h: 'FAQ', p: 'The questions parents ask before booking.' },
            { href: '/pricing', h: 'Pricing', p: 'What things cost, and what is free.' },
            { href: '/tutors', h: 'Our tutors', p: 'Who teaches what, and how they are approved.' },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block h-full rounded-2xl border border-hairline bg-base-raised p-5 transition-colors hover:border-ink/30"
              >
                <p className="text-[1rem] font-medium text-ink">{l.h}</p>
                <p className="mt-2 text-[0.88rem] leading-relaxed font-light text-ink-dim">
                  {l.p}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </SiteShell>
  )
}
