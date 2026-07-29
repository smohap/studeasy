import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_LABEL, type Role } from '../auth/roles'

/**
 * Role-gated portal shells. These are scaffolding: they prove the auth and
 * role model end to end and list what each portal owes its user per prd.html.
 * None of the features below are built yet, and the page says so rather than
 * showing fake data that could be mistaken for working software.
 */
const PLANNED: Record<Role, { blurb: string; items: string[] }> = {
  student: {
    blurb: 'Everything due, everything shaky, and help at 9pm.',
    items: [
      "Today's lesson, homework due and upcoming tests, ordered by urgency",
      'AI Study Coach — questions answered from your tutor’s own worksheets',
      'Personal learning path, recalculated after every graded activity',
      'Homework upload, practice generator and step-by-step doubt solver',
      'Interactive whiteboard, plus recorded lessons you can search',
    ],
  },
  parent: {
    blurb: 'What your child actually did, in plain English.',
    items: [
      'Attendance, homework, test scores and tutor comments',
      'AI parent report — a short written note, AI-drafted and tutor-reviewed',
      'Monthly trends for accuracy, completion, attendance and time spent',
      'Invoices, payments and upcoming classes',
      'Export or delete your child’s full record on request',
    ],
  },
  tutor: {
    blurb: 'Your evening back, without losing your teaching style.',
    items: [
      "Today's schedule with one-tap attendance",
      'AI lesson planner and worksheet generator, trained on your materials',
      'Homework queue with AI-assisted marking to review and correct',
      'Auto-drafted lesson summaries you approve before they are sent',
      'Student notes, messages and reports',
    ],
  },
  admin: {
    blurb: 'The business in one console.',
    items: [
      'Students, tutors, courses and enrolments',
      'Payments, invoices, coupons and certificates',
      'Tutor utilisation, revenue and churn risk',
      'Announcements and email',
      'Role management and the admin allowlist',
    ],
  },
}

export default function Portal({ role }: { role: Role }) {
  const { profile, signOut } = useAuth()
  const plan = PLANNED[role]
  const name = profile?.full_name?.split(' ')[0]

  return (
    <div className="min-h-svh px-5 py-8 sm:px-8">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link to="/" className="text-[1.05rem] font-extrabold tracking-tight uppercase">
          Stud<span className="text-accent">Easy</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-[0.85rem] font-light text-ink-dim sm:inline">
            {profile?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-[0.85rem] font-light text-ink transition-colors hover:border-ink/40"
          >
            <LogOut size={15} aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto mt-16 max-w-5xl pb-24">
        <p className="text-[0.8rem] font-medium tracking-[0.2em] text-accent uppercase">
          {ROLE_LABEL[role]} portal
        </p>
        <h1 className="display text-gradient mt-4 text-[clamp(2.4rem,8vw,5rem)]">
          {name ? `Kia ora, ${name}` : ROLE_LABEL[role]}
        </h1>
        <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
          {plan.blurb}
        </p>

        <section
          aria-labelledby="planned-heading"
          className="mt-14 rounded-3xl border border-hairline bg-base-raised p-7 sm:p-10"
        >
          <h2 id="planned-heading" className="text-[1.15rem] font-semibold tracking-tight text-ink">
            Not built yet
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed font-light text-ink-dim">
            You are signed in and your role is set, which is all this portal does so far.
            These are the features it owes you:
          </p>
          <ul className="mt-7 flex flex-col gap-3">
            {plan.items.map((item) => (
              <li
                key={item}
                className="flex gap-3 text-[0.95rem] leading-relaxed font-light text-ink"
              >
                <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
