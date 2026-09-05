'use client'

import { useState, useTransition } from 'react'
import { buildTopicTree } from '@/lib/taxonomy-tree'
import { setQuestionTopics } from '@/app/portal/taxonomy-actions'
import type { Topic, TaggedQuestion, TagCoverage, GradeBand } from '@/lib/taxonomy-types'

const BANDS: GradeBand[] = ['achieved', 'merit', 'excellence']

export default function TopicTagger({
  topics,
  assessments,
  selectedAssessment,
  questions,
  coverage,
}: {
  topics: Topic[]
  assessments: { id: string; title: string }[]
  selectedAssessment: string | null
  questions: TaggedQuestion[]
  coverage: TagCoverage
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [topicId, setTopicId] = useState('')
  const [band, setBand] = useState<GradeBand | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const tree = buildTopicTree(
    topics.map((t) => ({
      id: t.id,
      parent_id: t.parent_id,
      name: t.code ? `${t.code} — ${t.name}` : t.name,
      sort: t.sort,
    })),
  )

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Adds the chosen topic to every selected question, keeping existing tags. */
  function applyToSelection() {
    if (!topicId || picked.size === 0) return
    setError(null)
    startTransition(async () => {
      for (const questionId of picked) {
        const current = questions.find((q) => q.id === questionId)
        const merged = Array.from(new Set([...(current?.topic_ids ?? []), topicId]))
        const result = await setQuestionTopics(
          questionId,
          merged,
          band === '' ? (current?.grade_band ?? null) : band,
          current?.difficulty ?? null,
        )
        if (result.error) {
          setError(result.error)
          return
        }
      }
      setPicked(new Set())
    })
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Tag questions</h1>

      <p className="mt-2 text-sm text-slate-600" role="status">
        {coverage.tagged} of {coverage.total} questions tagged;{' '}
        {coverage.banded} carry a grade band. Untagged questions are ignored by
        the Learning Twin.
      </p>

      <label className="mt-6 block">
        <span className="text-sm font-medium">Assessment</span>
        <select
          className="mt-1 block w-full rounded border-slate-300"
          defaultValue={selectedAssessment ?? ''}
          onChange={(e) => {
            window.location.search = `?assessment=${e.target.value}`
          }}
        >
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
      </label>

      <fieldset className="mt-6 rounded border border-slate-200 p-4">
        <legend className="px-2 text-sm font-medium">
          Apply to {picked.size} selected
        </legend>

        <select
          aria-label="Topic"
          className="rounded border-slate-300"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          <option value="">Choose a topic…</option>
          {tree.map((root) => (
            <optgroup key={root.id} label={root.name}>
              <option value={root.id}>{root.name} (whole standard)</option>
              {root.children.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          aria-label="Grade band"
          className="ml-3 rounded border-slate-300"
          value={band}
          onChange={(e) => setBand(e.target.value as GradeBand | '')}
        >
          <option value="">Leave band unchanged</option>
          {BANDS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <button
          type="button"
          className="ml-3 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={pending || !topicId || picked.size === 0}
          onClick={applyToSelection}
        >
          {pending ? 'Applying…' : 'Apply'}
        </button>
      </fieldset>

      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}

      <ul className="mt-8 space-y-2">
        {questions.map((q) => (
          <li key={q.id} className="flex items-start gap-3 rounded border border-slate-200 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={picked.has(q.id)}
              onChange={() => toggle(q.id)}
              aria-label={`Select question ${q.position + 1}`}
            />
            <div>
              <p className="text-sm">{q.prompt}</p>
              <p className="mt-1 text-xs text-slate-500">
                {q.kind} · {q.marks} marks · {q.grade_band ?? 'no band'} ·{' '}
                {q.topic_ids.length === 0
                  ? 'untagged'
                  : `${q.topic_ids.length} topic${q.topic_ids.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
