'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { AiOutput } from '@/types/dashboard'
import { Panel, Skeleton } from './Ui'

/**
 * Renders one AI surface. Takes the loader rather than calling a fixture
 * directly, so every panel goes through `mock/ai.ts` and swapping in a real
 * call stays a one-file change.
 */
export default function AiPanel({
  title,
  question,
  load,
  autoLoad = true,
  footer,
}: {
  title: string
  /** The question this panel answers, in the reader's words. */
  question: string
  load: () => Promise<AiOutput>
  autoLoad?: boolean
  footer?: React.ReactNode
}) {
  const [output, setOutput] = useState<AiOutput | null>(null)
  const [loading, setLoading] = useState(autoLoad)

  useEffect(() => {
    if (!autoLoad) return
    let live = true
    load().then((o) => {
      if (live) {
        setOutput(o)
        setLoading(false)
      }
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad])

  return (
    <Panel
      title={title}
      subtitle={question}
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[0.75rem] font-medium text-accent-deep">
          <Sparkles size={13} aria-hidden />
          AI-drafted, tutor-reviewed
        </span>
      }
    >
      {loading && <Skeleton lines={4} />}

      {!loading && output && (
        <div>
          <p className="text-[1.05rem] leading-snug font-semibold tracking-tight text-app-ink">
            {output.headline}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {output.body.map((p) => (
              <p key={p} className="text-[0.92rem] leading-relaxed font-light text-app-muted">
                {p}
              </p>
            ))}
          </div>

          {/* The trust boundary, visible rather than implied. */}
          <p className="mt-5 border-t border-app-border pt-4 text-[0.8rem] leading-relaxed font-light text-app-muted">
            <span className="font-medium text-app-ink">Generated from:</span>{' '}
            {output.groundedIn}
          </p>

          {output.suggestedActions && output.suggestedActions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {output.suggestedActions.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="rounded-full border border-app-border px-3.5 py-1.5 text-[0.82rem] font-medium text-app-ink transition-colors hover:bg-app-subtle"
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          {footer}
        </div>
      )}
    </Panel>
  )
}
