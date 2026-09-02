import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getThread } from '@/lib/messages-data'
import { markThreadRead } from '@/app/portal/messages-actions'
import { Panel } from '@/components/app/Ui'
import ReplyBox from './ReplyBox'

export const metadata = { title: 'Conversation — StudEasy', robots: { index: false } }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const thread = await getThread(id)

  /*
   * Not a participant and no such thread give the same answer, because
   * threads_select returns nothing in both cases. There is deliberately no way
   * to tell from the outside which one it was.
   */
  if (!thread) notFound()

  // Opening the conversation is what marks it read.
  await markThreadRead(id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/messages"
          className="inline-flex items-center gap-2 text-[0.86rem] font-light text-app-muted hover:text-app-ink"
        >
          <ArrowLeft size={14} aria-hidden />
          All messages
        </Link>
        <h1 className="mt-3 text-[1.5rem] font-semibold tracking-tight text-app-ink">
          {thread.otherName}
        </h1>
        {thread.subject && (
          <p className="mt-1 text-[0.9rem] font-light text-app-muted">{thread.subject}</p>
        )}
      </div>

      <Panel title="Conversation">
        <ol className="flex flex-col gap-4">
          {thread.messages.map((m) => (
            <li
              key={m.id}
              className={`max-w-[85%] rounded-xl border border-app-border p-4 ${
                m.mine ? 'self-end bg-app-raised' : 'self-start'
              }`}
            >
              <p className="text-[0.78rem] font-medium tracking-[0.1em] text-app-muted uppercase">
                {m.mine ? 'You' : m.senderName}
              </p>
              {/* whitespace-pre-wrap so paragraphs a person typed survive. */}
              <p className="mt-2 text-[0.94rem] leading-relaxed font-light whitespace-pre-wrap">
                {m.body}
              </p>
              <time
                dateTime={m.sentAt}
                className="mt-2 block text-[0.78rem] font-light text-app-muted"
              >
                {new Date(m.sentAt).toLocaleString('en-NZ', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Reply">
        <ReplyBox threadId={thread.id} />
      </Panel>
    </div>
  )
}
