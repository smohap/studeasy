import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import { NotBuiltYet, Panel, PortalHeader } from '@/components/PortalHeader'
import TutorApprovals, { type PendingTutor } from './TutorApprovals'

export const metadata = { title: 'Admin — StudEasy', robots: { index: false } }

export default async function AdminPortal() {
  const { profile } = await getCurrentUser()
  if (profile?.role !== 'admin') redirect(destinationFor(profile))

  const supabase = await createClient()

  const { data: tutors } = await supabase
    .from('profiles')
    .select('id, full_name, email, teaching_subjects, status, created_at')
    .eq('role', 'tutor')
    .order('created_at', { ascending: true })

  const all = (tutors ?? []) as PendingTutor[]
  const pending = all.filter((t) => t.status === 'pending')
  const decided = all.filter((t) => t.status !== 'pending')

  const { count: studentCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'student')

  const { count: parentCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'parent')

  return (
    <>
      <PortalHeader role="admin" name={profile.full_name} blurb="The business in one console." />

      <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Students" value={studentCount ?? 0} />
        <Stat label="Parents" value={parentCount ?? 0} />
        <Stat label="Tutors approved" value={all.filter((t) => t.status === 'active').length} />
        <Stat label="Awaiting approval" value={pending.length} accent={pending.length > 0} />
      </ul>

      <Panel title="Tutor approvals">
        <TutorApprovals pending={pending} decided={decided} />
      </Panel>

      <NotBuiltYet
        items={[
          'Students, tutors, courses and enrolments',
          'Payments, invoices, coupons and certificates',
          'Tutor utilisation, revenue and churn risk',
          'Announcements and email',
        ]}
      />
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <li className="rounded-2xl border border-hairline bg-base-raised p-5 sm:p-6">
      <p
        className={`text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold tracking-tight ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[0.85rem] font-light text-ink-dim">{label}</p>
    </li>
  )
}
