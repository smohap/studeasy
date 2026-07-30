'use client'

import { useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { studentCoachReply } from '@/mock/ai'
import type { AiOutput } from '@/types/dashboard'
import { Panel, Skeleton } from '@/components/app/Ui'

type Turn = { role: 'you' | 'coach'; text: string; groundedIn?: string }

export default function StudyCoach({ prompts }: { prompts: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)

  async function ask(question: string) {
    const q = question.trim()
    if (!q || thinking) return

    setTurns((t) => [...t, { role: 'you', text: q }])
    setDraft('')
    setThinking(true)

    const reply: AiOutput = await studentCoachReply(q)
    setTurns((t) => [
      ...t,
      { role: 'coach', text: reply.body.join('\n\n'), groundedIn: reply.groundedIn },
    ])
    setThinking(false)
  }

  return (
    <Panel
      title="AI Study Coach"
      subtitle="Answers come from your tutor's own worksheets and your marked work — not the open internet."
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[0.75rem] font-medium text-accent-deep">
          <Sparkles size={13} aria-hidden />
          Grounded in academy material
        </span>
      }
    >
      <div
        role="log"
        aria-live="polite"
        aria-label="Study coach conversation"
        className="flex max-h-80 flex-col gap-4 overflow-y-auto"
      >
        {turns.length === 0 && !thinking && (
          <p className="text-[0.9rem] leading-relaxed font-light text-app-muted">
            Ask anything about what you are working on. Nothing you ask here goes to your
            tutor unless you send it to them.
          </p>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === 'you'
                ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-app-subtle px-4 py-3'
                : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-app-border px-4 py-3'
            }
          >
            <p className="text-[0.78rem] font-semibold text-app-muted">
              {t.role === 'you' ? 'You' : 'Study Coach'}
            </p>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed font-light whitespace-pre-line text-app-ink">
              {t.text}
            </p>
            {t.groundedIn && (
              <p className="mt-3 text-[0.78rem] font-light text-app-muted">
                <span className="font-medium text-app-ink">From:</span> {t.groundedIn}
              </p>
            )}
          </div>
        ))}

        {thinking && (
          <div className="max-w-[92%] rounded-2xl border border-app-border px-4 py-3">
            <Skeleton lines={3} />
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => ask(p)}
            disabled={thinking}
            className="rounded-full border border-app-border px-3.5 py-1.5 text-left text-[0.82rem] font-light text-app-ink transition-colors hover:bg-app-subtle disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(draft)
        }}
        className="mt-4 flex gap-2"
      >
        <label htmlFor="coach-input" className="sr-only">
          Ask the study coach
        </label>
        <input
          id="coach-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Why did I get question 3 wrong?"
          className="min-w-0 flex-1 rounded-full border border-app-border bg-app px-4 py-2.5 text-[0.9rem] font-light text-app-ink placeholder:text-app-muted"
        />
        <button
          type="submit"
          disabled={thinking || !draft.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[#100c00] disabled:opacity-40"
        >
          <span className="sr-only">Send</span>
          <Send size={16} aria-hidden />
        </button>
      </form>
    </Panel>
  )
}
