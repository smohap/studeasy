'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Paperclip } from 'lucide-react'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { HelpRequest } from '@/lib/help-data'
import type { Status } from '@/types/dashboard'
import { DOCUMENT_ACCEPT, uploadTo, type Uploaded } from '@/lib/upload'
import { answerHelp } from '@/app/portal/help-actions'

const TONE: Record<HelpRequest['status'], Status> = {
  open: { tone: 'warn', label: 'Unanswered' },
  answered: { tone: 'good', label: 'Answered' },
  closed: { tone: 'neutral', label: 'Closed' },
}

export default function HelpQueue({ requests }: { requests: HelpRequest[] }) {
  const waiting = requests.filter((r) => r.status === 'open')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Students asking for help
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Longest wait first. {waiting.length} still unanswered.
        </p>
      </div>

      <Panel title="The queue">
        {requests.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="When a student uploads a question or a worksheet they are stuck on, it appears here."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function RequestCard({ request: r }: { request: HelpRequest }) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<Uploaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  const waitingDays = Math.floor(
    (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000,
  )

  async function attach(chosen: File) {
    setError(null)
    setBusy(true)
    try {
      setFile(await uploadTo('help-uploads', 'answer', chosen))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That upload did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-medium text-app-ink">{r.title}</p>
          <p className="mt-0.5 text-[0.83rem] font-light text-app-muted">
            {r.studentName}
            {r.yearLevel && ` · ${r.yearLevel}`}
            {r.subject && ` · ${r.subject}`} ·{' '}
            {waitingDays === 0
              ? 'asked today'
              : `waiting ${waitingDays} ${waitingDays === 1 ? 'day' : 'days'}`}
          </p>
        </div>
        <StatusChip status={TONE[r.status]} />
      </div>

      {r.body && (
        <p className="mt-3 rounded-lg bg-app-subtle p-3 text-[0.87rem] leading-relaxed font-light whitespace-pre-line text-app-ink">
          {r.body}
        </p>
      )}

      {r.fileUrl && (
        <a
          href={r.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-medium text-app-ink hover:bg-app-subtle"
        >
          <Paperclip size={13} aria-hidden />
          {r.fileName ?? 'What they were given'}
        </a>
      )}

      {r.responses.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-app-border pt-4">
          {r.responses.map((a) => (
            <li key={a.id} className="text-[0.85rem] font-light text-app-muted">
              {a.isAccepted && (
                <CheckCircle2
                  size={13}
                  aria-hidden
                  className="mr-1.5 inline text-app-good"
                />
              )}
              <span className="font-medium text-app-ink">{a.responderName}</span>:{' '}
              {a.body.length > 160 ? `${a.body.slice(0, 160)}…` : a.body}
            </li>
          ))}
        </ul>
      )}

      {r.status !== 'closed' && (
        <form
          className="mt-4 border-t border-app-border pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            start(async () => {
              const res = await answerHelp(r.id, body, file?.path, file?.name)
              if (res.error) {
                setError(res.error)
                return
              }
              setBody('')
              setFile(null)
              setSent(true)
            })
          }}
        >
          <label
            htmlFor={`ans-${r.id}`}
            className="block text-[0.8rem] font-medium text-app-muted"
          >
            Your answer
          </label>
          <textarea
            id={`ans-${r.id}`}
            rows={4}
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setSent(false)
            }}
            placeholder="Work through the method, not just the answer — that is what they will use next time."
            className="mt-1.5 w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.89rem] font-light text-app-ink placeholder:text-app-muted"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || busy || !body.trim()}
              className="rounded-full bg-accent px-6 py-2.5 text-[0.86rem] font-medium text-[#100c00] disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Send answer'}
            </button>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-app-border px-4 py-2 text-[0.84rem] font-light text-app-ink hover:bg-app-subtle">
              <Paperclip size={13} aria-hidden />
              {busy ? 'Uploading…' : (file?.name ?? 'Attach a worked solution')}
              <input
                type="file"
                accept={DOCUMENT_ACCEPT}
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const chosen = e.target.files?.[0]
                  if (chosen) attach(chosen)
                }}
              />
            </label>

            {sent && (
              <span role="status" className="text-[0.84rem] font-medium text-app-good">
                Sent — they have been notified.
              </span>
            )}
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[0.84rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}
