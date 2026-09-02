import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listMessageablePeople, listThreads } from '@/lib/messages-data'
import { EmptyState, Panel } from '@/components/app/Ui'
import Composer from './Composer'

export const metadata = { title: 'Messages — StudEasy', robots: { index: false } }

/*
 * One inbox for every role rather than four copies. Who you may talk to
 * differs by role, but that is may_message()'s job, not the page's.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  if (!profile) redirect('/sign-in')

  const [threads, people] = await Promise.all([listThreads(), listMessageablePeople()])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Messages
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Private conversations with the teachers you work with. For anything the whole
          class would benefit from, the{' '}
          <Link href="/forum" className="underline underline-offset-4">
            forum
          </Link>{' '}
          is the better place.
        </p>
      </div>

      <Panel title="Start a conversation">
        <Composer people={people} />
      </Panel>

      <Panel title="Your conversations">
        {threads.length === 0 ? (
          <EmptyState
            title="No messages yet"
            body="Nothing here until you or a teacher starts a conversation."
          />
        ) : (
          <ul className="flex flex-col">
            {threads.map((t) => (
              <li key={t.id} className="border-b border-app-border last:border-0">
                <Link
                  href={`/portal/messages/${t.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[0.95rem] font-medium">
                      {t.otherName}
                      {t.unread > 0 && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-semibold text-[#100c00]">
                          {t.unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      )}
                    </p>
                    {t.subject && (
                      <p className="mt-0.5 text-[0.85rem] font-light text-app-muted">
                        {t.subject}
                      </p>
                    )}
                    {t.preview && (
                      <p className="mt-1 truncate text-[0.85rem] font-light text-app-muted">
                        {t.preview}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={t.lastAt}
                    className="shrink-0 text-[0.8rem] font-light text-app-muted"
                  >
                    {new Date(t.lastAt).toLocaleDateString('en-NZ', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
