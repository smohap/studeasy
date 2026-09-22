'use client'

import { useState, useTransition } from 'react'
import { reviewProjection } from '@/app/portal/twin-actions'
import { gradeLabel, confidenceSentence } from '@/lib/twin-format'
import type { Projection } from '@/lib/twin-types'

export default function ReviewProjection({
  studentId,
  projection,
}: {
  studentId: string
  projection: Projection
}) {
  const [note, setNote] = useState(projection.tutor_note ?? '')
  const [release, setRelease] = useState(projection.released_to_parent)
  const [released, setReleased] = useState(projection.released_to_parent)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await reviewProjection(studentId, projection.topic_id, note, release)
      if (result.error) {
        setError(result.error)
        return
      }
      setReleased(release)
      setSaved(true)
    })
  }

  return (
    <li className="rounded border border-slate-200 p-4">
      <h3 className="font-medium">
        {projection.standard_code} — {projection.standard_name}
      </h3>

      {/* A grade never appears without the sentence beside it that says what
          it is standing on. */}
      <p className="mt-1 text-2xl">{gradeLabel(projection.projected_grade)}</p>
      <p className="mt-1 text-sm text-slate-600">
        {confidenceSentence(projection.confidence, projection.seen)}
      </p>

      {projection.levers.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium">What would move it</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
            {projection.levers.slice(0, 3).map((l) => (
              <li key={l.topic_id}>{l.name}</li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-sm text-slate-600">
        {released
          ? 'This grade is visible to the parent.'
          : 'Not shared with the parent.'}
      </p>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Note for the parent</span>
        <textarea
          className="mt-1 block w-full rounded border-slate-300 text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={release}
          onChange={(e) => setRelease(e.target.checked)}
        />
        Release to parent
      </label>

      <button
        type="button"
        className="mt-3 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={pending}
        onClick={save}
      >
        {pending ? 'Saving…' : 'Save review'}
      </button>

      {saved && !error && (
        <p className="mt-2 text-sm text-green-700" role="status">
          Saved.
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
