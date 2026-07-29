import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { destinationFor } from '@/lib/roles'
import { NotBuiltYet, Panel, PortalHeader } from '@/components/PortalHeader'
import LinkStudentForm from './LinkStudentForm'

export const metadata = { title: 'Parent portal — StudEasy', robots: { index: false } }

export default async function ParentPortal() {
  const { userId, profile } = await getCurrentUser()
  if (profile?.role !== 'parent') redirect(destinationFor(profile))

  // RLS lets a parent read exactly their own linked children.
  const supabase = await createClient()
  const { data: children } = await supabase
    .from('profiles')
    .select('id, full_name, year_level, subjects, student_code')
    .eq('parent_id', userId)

  return (
    <>
      <PortalHeader
        role="parent"
        name={profile.full_name}
        blurb="What your child actually did, in plain English."
      />

      <Panel title="Your children">
        {children && children.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {children.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded-2xl border border-hairline bg-base p-5"
              >
                <div>
                  <p className="text-[1rem] font-medium text-ink">{c.full_name ?? 'Student'}</p>
                  <p className="mt-1 text-[0.88rem] font-light text-ink-dim">
                    {c.year_level ?? 'Year level not set'}
                    {c.subjects?.length ? ` · ${c.subjects.join(', ')}` : ''}
                  </p>
                </div>
                <span className="font-mono text-[0.85rem] text-accent">{c.student_code}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.94rem] leading-relaxed font-light text-ink-dim">
            No students linked yet. Ask your child for the Student ID shown on their
            portal.
          </p>
        )}

        <div className="mt-7 border-t border-hairline pt-7">
          <LinkStudentForm />
        </div>
      </Panel>

      <NotBuiltYet
        items={[
          'Attendance, homework, test scores and tutor comments',
          'AI parent report — a short written note, AI-drafted and tutor-reviewed',
          'Monthly trends for accuracy, completion, attendance and time spent',
          'Invoices, payments and upcoming classes',
          'Export or delete your child’s full record on request',
        ]}
      />
    </>
  )
}
