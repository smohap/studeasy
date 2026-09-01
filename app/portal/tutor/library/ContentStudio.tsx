'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Paperclip, Plus } from 'lucide-react'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
// From content-types, not content-data: this is a client component, and
// content-data reaches next/headers.
import {
  CONTENT_KIND_LABEL,
  type ContentItem,
  type ContentKind,
} from '@/lib/content-types'
import type { Status } from '@/types/dashboard'
import { uploadTo, type Uploaded } from '@/lib/upload'
import {
  createContent,
  setContentStatus,
  updateContent,
  type NewContent,
} from '@/app/portal/content-actions'

const TONE: Record<ContentItem['status'], Status> = {
  draft: { tone: 'warn', label: 'Draft' },
  published: { tone: 'good', label: 'On sale' },
  archived: { tone: 'neutral', label: 'Archived' },
}

const BLANK: NewContent = {
  title: '',
  summary: '',
  subject: '',
  yearLevel: '',
  kind: 'notes',
  filePath: '',
  fileName: '',
  externalUrl: '',
  preview: '',
  priceDollars: '0',
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.9rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

export default function ContentStudio({
  items,
  subjects,
}: {
  items: ContentItem[]
  subjects: string[]
}) {
  const [form, setForm] = useState<NewContent>(BLANK)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [file, setFile] = useState<Uploaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const set = <K extends keyof NewContent>(k: K, v: NewContent[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function startEdit(item: ContentItem) {
    setEditingId(item.id)
    setError(null)
    setNote(null)
    setFile(
      item.file_path ? { path: item.file_path, name: item.file_name ?? 'File' } : null,
    )
    setForm({
      title: item.title,
      summary: item.summary ?? '',
      subject: item.subject ?? '',
      yearLevel: item.year_level ?? '',
      kind: item.kind,
      filePath: item.file_path ?? '',
      fileName: item.file_name ?? '',
      externalUrl: item.external_url ?? '',
      preview: item.preview ?? '',
      priceDollars: (item.price_cents / 100).toFixed(2),
    })
    document.getElementById('content-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function attach(chosen: File) {
    setError(null)
    setBusy(true)
    try {
      const up = await uploadTo('content-library', 'item', chosen)
      setFile(up)
      setForm((f) => ({ ...f, filePath: up.path, fileName: up.name }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That upload did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Content library
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Notes, worksheets and past papers. Give them away or put a price on them —
          either way students find them in the library.
        </p>
      </div>

      <Panel
        title={editingId ? 'Edit item' : 'New item'}
        subtitle="It stays a draft until you publish it."
      >
        <form
          id="content-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            setNote(null)
            start(async () => {
              const res = editingId
                ? await updateContent(editingId, form)
                : await createContent(form)
              if (res.error) {
                setError(res.error)
                return
              }
              setNote(editingId ? 'Saved.' : 'Created as a draft.')
              setForm(BLANK)
              setFile(null)
              setEditingId(null)
            })
          }}
        >
          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-title">
              Title
            </label>
            <input
              id="c-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="NCEA Level 2 calculus — worked examples"
              className={`${field} mt-1.5`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-summary">
              Summary
            </label>
            <input
              id="c-summary"
              value={form.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="One line, shown on the card."
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-kind">
              Type
            </label>
            <select
              id="c-kind"
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as ContentKind)}
              className={`${field} mt-1.5`}
            >
              {(Object.keys(CONTENT_KIND_LABEL) as ContentKind[]).map((k) => (
                <option key={k} value={k}>
                  {CONTENT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="c-subject">
              Subject
            </label>
            <select
              id="c-subject"
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              className={`${field} mt-1.5`}
            >
              <option value="">Not subject-specific</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="c-year">
              Year level
            </label>
            <input
              id="c-year"
              value={form.yearLevel}
              onChange={(e) => set('yearLevel', e.target.value)}
              placeholder="Year 12 · NCEA Level 2"
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <label className={label} htmlFor="c-price">
              Price (NZD, 0 for free)
            </label>
            <input
              id="c-price"
              type="number"
              min={0}
              step="0.01"
              value={form.priceDollars}
              onChange={(e) => set('priceDollars', e.target.value)}
              className={`${field} mt-1.5`}
            />
          </div>

          <div>
            <span className={label}>The file</span>
            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-app-border px-4 py-2 text-[0.86rem] font-light text-app-ink hover:bg-app-subtle">
              <Paperclip size={14} aria-hidden />
              {busy ? 'Uploading…' : file ? 'Replace the file' : 'Upload'}
              <input
                type="file"
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

          <div>
            <label className={label} htmlFor="c-url">
              …or a link
            </label>
            <input
              id="c-url"
              value={form.externalUrl}
              onChange={(e) => set('externalUrl', e.target.value)}
              placeholder="https://…"
              aria-describedby="c-url-hint"
              className={`${field} mt-1.5`}
            />
            <p id="c-url-hint" className="mt-1.5 text-[0.79rem] font-light text-app-muted">
              A video or an external page. One of the two is enough.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-preview">
              Preview
            </label>
            <textarea
              id="c-preview"
              rows={3}
              value={form.preview}
              onChange={(e) => set('preview', e.target.value)}
              placeholder="Shown to everyone, bought or not. Nobody pays for a title alone."
              className={`${field} mt-1.5`}
            />
          </div>

          {error && (
            <p role="alert" className="text-[0.85rem] text-app-bad sm:col-span-2">
              {error}
            </p>
          )}
          {note && (
            <p role="status" className="text-[0.85rem] text-app-good sm:col-span-2">
              {note}
            </p>
          )}

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={pending || busy}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-60"
            >
              <Plus size={16} aria-hidden />
              {pending ? 'Saving…' : editingId ? 'Save changes' : 'Create draft'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(BLANK)
                  setFile(null)
                }}
                className="rounded-full border border-app-border px-6 py-2.5 text-[0.88rem] font-light text-app-ink"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="Everything you have written">
        {items.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            body="Upload a worksheet or a set of notes above, then publish it."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-medium text-app-ink">{item.title}</p>
                  <p className="mt-0.5 text-[0.84rem] font-light text-app-muted">
                    {CONTENT_KIND_LABEL[item.kind]}
                    {item.subject && ` · ${item.subject}`} ·{' '}
                    {item.price_cents === 0
                      ? 'Free'
                      : `$${(item.price_cents / 100).toFixed(2)}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={TONE[item.status]} />
                  {item.status === 'published' && (
                    <Link
                      href={`/library/${item.id}`}
                      className="rounded-full border border-app-border px-4 py-2 text-[0.83rem] font-medium text-app-ink hover:bg-app-subtle"
                    >
                      View
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded-full border border-app-border px-4 py-2 text-[0.83rem] font-medium text-app-ink hover:bg-app-subtle"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await setContentStatus(
                          item.id,
                          item.status === 'published' ? 'draft' : 'published',
                        )
                        setError(res.error)
                      })
                    }
                    className="rounded-full bg-accent px-4 py-2 text-[0.83rem] font-medium text-[#100c00] disabled:opacity-60"
                  >
                    {item.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
