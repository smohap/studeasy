import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { redeemPendingStudentCode } from '@/app/auth/actions'
import { Panel } from '@/components/app/Ui'
import ParentDashboard from './ParentDashboard'
import LinkStudentForm from './LinkStudentForm'

export const metadata = { title: 'Parent — StudEasy', robots: { index: false } }

export default async function ParentPortal() {
  const { userId, profile } = await getCurrentUser()
  guardRole(profile, 'parent')

  // Everything above the account panel is fixtures. Without credentials there
  // is no live account to read, so the panel is skipped rather than crashing.
  if (!isAuthConfigured) {
    return <ParentDashboard name={profile?.full_name} />
  }

  // A Student ID typed during email registration could not be redeemed then —
  // there was no session. Cash it in now, once.
  const pending = await redeemPendingStudentCode()

  // RLS lets a parent read exactly their own linked children.
  const supabase = await createClient()
  const { data: children } = await supabase
    .from('profiles')
    .select('id, full_name, year_level, subjects, student_code')
    .eq('parent_id', userId)

  // Requests this parent has sent that the student has not answered yet.
  const { data: waiting } = await supabase.rpc('my_pending_links')
  const pendingLinks = (waiting ?? []) as {
    id: string
    student_code: string
    asked_at: string
  }[]

  return (
    <div className="flex flex-col gap-6">
      <ParentDashboard name={profile?.full_name} />

      {/*
        The one live panel on this page. Everything above renders fixtures; this
        reads the real linked children so the Student ID flow stays usable.
      */}
      <Panel
        title="Your account"
        subtitle="Linked students on your real account, separate from the demo data above."
      >
        {pending.error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-app-bad/30 bg-app-bad-bg p-4 text-[0.88rem] leading-relaxed font-light text-app-ink"
          >
            We could not use the Student ID you gave when registering: {pending.error} Try
            again below.
          </p>
        )}

        {children && children.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {children.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div>
                  <p className="text-[0.95rem] font-medium">{c.full_name ?? 'Student'}</p>
                  <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                    {c.year_level ?? 'Year level not set'}
                    {c.subjects?.length ? ` · ${c.subjects.join(', ')}` : ''}
                  </p>
                </div>
                <span className="font-mono text-[0.85rem] text-accent-deep">
                  {c.student_code}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9rem] leading-relaxed font-light text-app-muted">
            No students linked yet. Ask your child for the Student ID shown on their portal.
          </p>
        )}

        {pendingLinks.length > 0 && (
          <div className="mt-6 rounded-xl border border-app-warn/30 bg-app-warn-bg p-4">
            <p className="text-[0.9rem] font-medium text-app-ink">
              Waiting on your {pendingLinks.length === 1 ? 'child' : 'children'}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {pendingLinks.map((r) => (
                <li key={r.id} className="text-[0.87rem] font-light text-app-muted">
                  <span className="font-mono text-app-ink">{r.student_code}</span> — not
                  approved yet. They will see the request when they next sign in.
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 border-t border-app-border pt-6">
          <LinkStudentForm />
        </div>
      </Panel>
    </div>
  )
}
