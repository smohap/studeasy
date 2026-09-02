import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listAuditLog } from '@/lib/admin-data'
import { EmptyState, Panel } from '@/components/app/Ui'

export const metadata = { title: 'Audit log — StudEasy', robots: { index: false } }

/*
 * Role grants, course status moves and money changing state. Written by
 * database triggers rather than by the application, so this records what
 * happened to the data — including anything done straight through the SQL
 * editor, which an application-level log would miss entirely.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  const entries = await listAuditLog()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Audit log
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Role changes, course approvals and payment state, recorded by the database
          itself. Append-only — nothing here can be edited or removed from the app.
        </p>
      </div>

      <Panel title="Recent activity" subtitle="Newest first, up to 200 entries.">
        {entries.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            body="Entries appear as soon as a role is granted, a course changes status, or an order is paid or refunded."
          />
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="border-b border-app-border py-4 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-mono text-[0.86rem] font-medium">{e.action}</p>
                  <time
                    dateTime={e.at}
                    className="text-[0.8rem] font-light text-app-muted"
                  >
                    {new Date(e.at).toLocaleString('en-NZ', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </div>

                <p className="mt-1 text-[0.85rem] font-light text-app-muted">
                  by {e.actor}
                </p>

                {e.detail && (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    {Object.entries(e.detail)
                      // A null in the detail is usually "there was no previous
                      // status", which the action's own suffix already conveys.
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-1.5">
                          <dt className="text-[0.76rem] text-app-muted">
                            {k.replace(/_/g, ' ')}
                          </dt>
                          <dd className="font-mono text-[0.78rem]">{String(v)}</dd>
                        </div>
                      ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
