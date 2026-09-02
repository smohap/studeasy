import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { listContactMessages } from '@/lib/admin-data'
import { EmptyState, Panel } from '@/components/app/Ui'
import ContactInbox from './ContactInbox'

export const metadata = { title: 'Contact inbox — StudEasy', robots: { index: false } }

/*
 * Everything written through the public /contact form.
 *
 * This page is the reason that form is allowed to exist: an open write
 * endpoint whose messages nobody reads is worse than no form at all, because
 * it tells a parent somebody is listening when nobody is.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  const messages = await listContactMessages()
  const unread = messages.filter((m) => m.status === 'new').length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Contact inbox
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Messages from the public contact form.{' '}
          {unread === 0
            ? 'Nothing is waiting.'
            : `${unread} ${unread === 1 ? 'message needs' : 'messages need'} a reply.`}{' '}
          Replies go by email — this is a queue, not a mailbox.
        </p>
      </div>

      {messages.length === 0 ? (
        <EmptyState
          title="No messages"
          body="Nothing has been sent through the contact form. If you expected something, check that supabase/public-site.sql has been run — the form fails loudly for the sender if it has not."
        />
      ) : (
        <Panel title="Messages" subtitle="Newest first, unanswered at the top.">
          <ContactInbox messages={messages} />
        </Panel>
      )}
    </div>
  )
}
