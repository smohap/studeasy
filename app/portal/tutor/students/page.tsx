import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { getRoster, listClassesForTeacher } from '@/lib/classes-data'
import { EmptyState, Panel } from '@/components/app/Ui'

export const metadata = { title: 'My students — StudEasy', robots: { index: false } }

/*
 * Everyone holding a seat in one of this teacher's classes.
 *
 * This page used to list invented students with invented attendance. A teacher
 * could have gone looking for a child who does not exist.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'tutor')

  const classes = await listClassesForTeacher()
  const rosters = await Promise.all(classes.map((c) => getRoster(c.session.id)))

  // The same student often appears in several classes; count them once, and
  // remember which classes they are in.
  const byStudent = new Map<
    string,
    { name: string; email: string | null; studentCode: string | null; classes: string[] }
  >()

  rosters.forEach((roster, i) => {
    for (const entry of roster) {
      if (entry.registration.status === 'waitlisted') continue
      const existing = byStudent.get(entry.registration.student_id)
      if (existing) existing.classes.push(classes[i].session.title)
      else
        byStudent.set(entry.registration.student_id, {
          name: entry.name,
          email: entry.email,
          studentCode: entry.studentCode,
          classes: [classes[i].session.title],
        })
    }
  })

  const students = [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          My students
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Everyone holding a seat in one of your classes.
        </p>
      </div>

      <Panel
        title={`${students.length} ${students.length === 1 ? 'student' : 'students'}`}
      >
        {students.length === 0 ? (
          <EmptyState
            title="Nobody registered yet"
            body="Schedule a class and publish it — students appear here as they register."
            action={
              <Link
                href="/portal/tutor/classes"
                className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
              >
                Schedule a class
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {students.map((s) => (
              <li
                key={s.studentCode ?? s.name}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-medium text-app-ink">
                    {s.name}
                    {s.studentCode && (
                      <span className="ml-2 font-mono text-[0.8rem] text-app-muted">
                        {s.studentCode}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[0.84rem] font-light text-app-muted">
                    {s.email}
                  </p>
                </div>
                <p className="shrink-0 text-right text-[0.83rem] font-light text-app-muted">
                  {s.classes.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
