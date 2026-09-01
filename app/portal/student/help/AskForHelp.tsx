'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Paperclip, Plus } from 'lucide-react'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { HelpRequest } from '@/lib/help-data'
import type { Status } from '@/types/dashboard'
import { DOCUMENT_ACCEPT, uploadTo, type Uploaded } from '@/lib/upload'
import { acceptAnswer, askForHelp, closeHelpRequest } from '@/app/portal/help-actions'

const TONE: Record<HelpRequest['status'], Status> = {
  open: { tone: 'warn', label: 'Waiting for a tutor' },
  answered: { tone: 'good', label: 'Answered' },
  closed: { tone: 'neutral', label: 'Closed' },
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.9rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

export default function AskForHelp({
  requests,
  subjects,
}: {
  requests: HelpRequest[]
  subjects: string[]
}) {
  const [asking, setAsking] = useState(requests.length === 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Get help with a question
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Type it out, or attach the worksheet you were given. A tutor answers — not
          another student guessing.
        </p>
      </div>

      {asking ? (
        <AskForm subjects={subjects} onDone={() => setAsking(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
        >
          <Plus size={16} aria-hidden />
          Ask about something else
        </button>
      )}

      <Panel title="Your questions">
        {requests.length === 0 ? (
          <EmptyState
            title="Nothing asked yet"
            body="Stuck on a problem? Describe it above, or upload the sheet, and a tutor will work through it with you."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function AskForm({ subjects, onDone }: { subjects: string[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [file, setFile] = useState<Uploaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  async function attach(chosen: File) {
    setError(null)
    setBusy(true)
    try {
      setFile(await uploadTo('help-uploads', 'request', chosen))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That upload did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="What are you stuck on?">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          start(async () => {
            const res = await askForHelp({
              title,
              body,
              subject,
              yearLevel: '',
              filePath: file?.path ?? '',
              fileName: file?.name ?? '',
            })
            if (res.error) setError(res.error)
            else onDone()
          })
        }}
      >
        <div className="sm:col-span-2">
          <label className={label} htmlFor="h-title">
            What is it about?
          </label>
          <input
            id="h-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Question 4 on the trigonometry sheet"
            className={`${field} mt-1.5`}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={label} htmlFor="h-body">
            The question, and what you have tried
          </label>
          <textarea
            id="h-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type it out here, or leave this blank and attach the file below."
            className={`${field} mt-1.5`}
          />
        </div>

        <div>
          <label className={label} htmlFor="h-subject">
            Subject
          </label>
          <select
            id="h-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`${field} mt-1.5`}
          >
            <option value="">Not sure</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={label}>Attach the sheet (optional)</span>
          <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-app-border px-4 py-2 text-[0.86rem] font-light text-app-ink hover:bg-app-subtle">
            <Paperclip size={14} aria-hidden />
            {busy ? 'Uploading…' : file ? 'Choose a different file' : 'PDF, Word or text'}
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
          {file && (
            <p className="mt-2 text-[0.82rem] font-light text-app-good">{file.name}</p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-[0.85rem] text-app-bad sm:col-span-2">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pending || busy}
            className="rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Ask for help'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-app-border px-6 py-2.5 text-[0.88rem] font-light text-app-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  )
}

function RequestCard({ request: r }: { request: HelpRequest }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <li className="rounded-xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-medium text-app-ink">{r.title}</p>
          <p className="mt-0.5 text-[0.83rem] font-light text-app-muted">
            {new Date(r.createdAt).toLocaleDateString('en-NZ', {
              day: 'numeric',
              month: 'short',
            })}
            {r.subject && ` · ${r.subject}`}
            {r.responses.length > 0 &&
              ` · ${r.responses.length} ${r.responses.length === 1 ? 'answer' : 'answers'}`}
          </p>
        </div>
        <StatusChip status={TONE[r.status]} />
      </div>

      {r.body && (
        <p className="mt-3 text-[0.87rem] leading-relaxed font-light whitespace-pre-line text-app-muted">
          {r.body}
        </p>
      )}

      {r.fileUrl && (
        <a
          href={r.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-[0.85rem] font-medium text-app-ink hover:underline"
        >
          <Paperclip size={13} aria-hidden />
          {r.fileName ?? 'Attachment'}
        </a>
      )}

      {r.responses.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3 border-t border-app-border pt-4">
          {r.responses.map((a) => (
            <li
              key={a.id}
              className={`rounded-lg p-3 ${a.isAccepted ? 'bg-app-good-bg' : 'bg-app-subtle'}`}
            >
              {a.isAccepted && (
                <p className="mb-2 inline-flex items-center gap-1.5 text-[0.78rem] font-medium text-app-good">
                  <CheckCircle2 size={13} aria-hidden />
                  This one helped
                </p>
              )}
              <p className="text-[0.84rem] font-medium text-app-ink">{a.responderName}</p>
              <p className="mt-1.5 text-[0.87rem] leading-relaxed font-light whitespace-pre-line text-app-muted">
                {a.body}
              </p>

              {a.fileUrl && (
                <a
                  href={a.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-[0.84rem] font-medium text-app-ink hover:underline"
                >
                  <Paperclip size={13} aria-hidden />
                  {a.fileName ?? 'Worked solution'}
                </a>
              )}

              {!a.isAccepted && r.status !== 'closed' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => setError((await acceptAnswer(a.id)).error))
                  }
                  className="mt-3 rounded-full border border-app-border px-4 py-1.5 text-[0.8rem] font-medium text-app-ink hover:bg-app-panel disabled:opacity-60"
                >
                  This answered it
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {r.status !== 'closed' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setError((await closeHelpRequest(r.id)).error))}
          className="mt-3 text-[0.83rem] font-light text-app-muted hover:text-app-ink"
        >
          Close this question
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[0.84rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}
