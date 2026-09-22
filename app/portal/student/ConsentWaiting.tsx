import { ShieldCheck } from 'lucide-react'
import { CONSENT_AGE } from '@/lib/consent'
import { Panel } from '@/components/app/Ui'
import LinkRequests, { type LinkRequest } from './LinkRequests'

/**
 * What a student under 16 sees instead of their dashboard.
 *
 * Two things have to be true of this screen. It has to explain the hold in
 * words a 13-year-old will actually read — not "your account is pending
 * verification" — and it has to contain the way out, because the only person
 * who can lift the gate is a parent the student themselves has to approve.
 * That is why the link requests are on this page rather than behind it: a
 * screen that said "ask a grown-up" and then hid the button would be a
 * deadlock with a friendly tone.
 */
export default function ConsentWaiting({
  name,
  studentCode,
  requests,
}: {
  name: string | null
  studentCode: string | null
  requests: LinkRequest[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] leading-tight font-semibold tracking-tight">
          Nearly there, {name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1.5 text-[0.92rem] font-light text-app-muted">
          One thing has to happen before you can start.
        </p>
      </header>

      <Panel
        title={`A parent or caregiver needs to confirm your account`}
        subtitle={`Anyone under ${CONSENT_AGE} needs this. It is a one-off.`}
      >
        <div className="flex gap-4">
          <ShieldCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-app-warn" />
          <div className="flex flex-col gap-4 text-[0.92rem] leading-relaxed font-light text-app-muted">
            <p>
              Give your parent or caregiver the Student ID below. They register their
              own account, enter your ID, and you approve them here. Then they confirm
              your account and everything opens up.
            </p>
            <p>
              Until then you can sign in and look around, but homework, assessments and
              the progress pages stay locked — and nothing you do is recorded.
            </p>
          </div>
        </div>

        {studentCode && (
          <div className="mt-6 rounded-2xl border border-app-border bg-app-subtle p-6 text-center">
            <p className="text-[0.72rem] font-medium tracking-[0.14em] text-app-muted uppercase">
              Your Student ID
            </p>
            <p className="mt-2 font-mono text-[1.6rem] tracking-[0.12em] text-app-ink">
              {studentCode}
            </p>
          </div>
        )}
      </Panel>

      {/* The way out has to be reachable from the screen that describes it. */}
      <LinkRequests requests={requests} />

      {requests.length === 0 && (
        <Panel
          title="Nobody has asked yet"
          subtitle="When a parent or caregiver enters your Student ID, their request appears here for you to approve."
        >
          <p className="text-[0.92rem] leading-relaxed font-light text-app-muted">
            If you have already given them the ID and nothing has shown up, check they
            registered as a <span className="text-app-ink">parent or caregiver</span>
            {' '}rather than as a student.
          </p>
        </Panel>
      )}
    </div>
  )
}
