'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Panel, StatusChip } from '@/components/app/Ui'
import type { Status } from '@/types/dashboard'
import { YEAR_LEVELS } from '@/lib/curriculum'
import { deletePost, savePost, type PostDraft } from './actions'

export type MyPost = {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  subject: string
  yearLevel: string
  kind: 'article' | 'guide' | 'news'
  coverEmoji: string
  status: 'draft' | 'published' | 'archived'
  publishedAt: string | null
}

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

const STATUS: Record<MyPost['status'], Status> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'good' },
  archived: { label: 'Archived', tone: 'warn' },
}

const BLANK: PostDraft = {
  title: '',
  summary: '',
  body: '',
  subject: '',
  yearLevel: '',
  kind: 'article',
  coverEmoji: '',
  status: 'draft',
}

export default function PostEditor({
  posts,
  subjects,
}: {
  posts: MyPost[]
  subjects: string[]
}) {
  const [draft, setDraft] = useState<PostDraft>(BLANK)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  function edit(p: MyPost) {
    setError(null)
    setSaved(null)
    setDraft({
      id: p.id,
      title: p.title,
      summary: p.summary,
      body: p.body,
      subject: p.subject,
      yearLevel: p.yearLevel,
      kind: p.kind,
      coverEmoji: p.coverEmoji,
      status: p.status,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Writing
        </h1>
        <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-relaxed font-light text-app-muted">
          Posts appear on the public blog under your name. A guide also appears
          on the free resources page. Text is rendered as plain paragraphs —
          blank lines start a new one, and no HTML or scripting gets through.
        </p>
      </div>

      <Panel
        title={draft.id ? 'Edit post' : 'New post'}
        subtitle={
          draft.id
            ? 'Changing the title does not change the published URL — links to it keep working.'
            : 'Save as a draft first if you want to read it back before anyone else can.'
        }
        actions={
          draft.id ? (
            <button
              type="button"
              onClick={() => {
                setDraft(BLANK)
                setSaved(null)
                setError(null)
              }}
              className="rounded-lg border border-app-border px-3 py-1.5 text-[0.82rem] font-light text-app-ink"
            >
              Start a new post
            </button>
          ) : undefined
        }
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            setSaved(null)
            start(async () => {
              const res = await savePost(draft)
              if (res.error) setError(res.error)
              else {
                setSaved(
                  draft.status === 'published'
                    ? 'Published. It is live on the blog now.'
                    : 'Saved as a draft. Nobody else can see it.',
                )
                if (!draft.id) setDraft(BLANK)
              }
            })
          }}
        >
          <div>
            <label className={label} htmlFor="po-title">Title</label>
            <input
              id="po-title"
              className={`${field} mt-1.5`}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="po-summary">Summary</label>
            <input
              id="po-summary"
              className={`${field} mt-1.5`}
              value={draft.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="One sentence, shown on the card and in search results."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className={label} htmlFor="po-kind">Kind</label>
              <select
                id="po-kind"
                className={`${field} mt-1.5`}
                value={draft.kind}
                onChange={(e) => set('kind', e.target.value as PostDraft['kind'])}
              >
                <option value="article">Article</option>
                <option value="guide">Guide (also on /resources)</option>
                <option value="news">News</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="po-subject">Subject</label>
              <select
                id="po-subject"
                className={`${field} mt-1.5`}
                value={draft.subject}
                onChange={(e) => set('subject', e.target.value)}
              >
                <option value="">Not subject specific</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="po-year">Year level</label>
              <select
                id="po-year"
                className={`${field} mt-1.5`}
                value={draft.yearLevel}
                onChange={(e) => set('yearLevel', e.target.value)}
              >
                <option value="">Any</option>
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="po-emoji">Cover emoji</label>
              <input
                id="po-emoji"
                className={`${field} mt-1.5`}
                maxLength={4}
                value={draft.coverEmoji}
                onChange={(e) => set('coverEmoji', e.target.value)}
                placeholder="📐"
              />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="po-body">Post</label>
            <textarea
              id="po-body"
              rows={14}
              className={`${field} mt-1.5`}
              value={draft.body}
              onChange={(e) => set('body', e.target.value)}
              required
            />
            <p className="mt-1.5 text-[0.78rem] font-light text-app-muted">
              {draft.body.trim().split(/\s+/).filter(Boolean).length} words —
              reading time is worked out from this, not typed in.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              className={`${field} max-w-44`}
              value={draft.status}
              onChange={(e) => set('status', e.target.value as PostDraft['status'])}
              aria-label="Status"
            >
              <option value="draft">Keep as draft</option>
              <option value="published">Publish</option>
              <option value="archived">Archive</option>
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-app-ink px-4 py-2 text-[0.86rem] font-medium text-white disabled:opacity-60"
            >
              {pending ? 'Saving…' : draft.id ? 'Save changes' : 'Save post'}
            </button>
            {saved && (
              <p role="status" className="text-[0.85rem] font-light text-app-good">
                {saved}
              </p>
            )}
            {error && (
              <p role="alert" className="text-[0.85rem] font-light text-app-bad">
                {error}
              </p>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="Your posts" subtitle="Drafts are visible only to you.">
        {posts.length === 0 ? (
          <p className="text-[0.88rem] font-light text-app-muted">
            You have not written anything yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {posts.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.94rem] font-medium text-app-ink">
                    {p.coverEmoji} {p.title}
                  </p>
                  <p className="mt-1 text-[0.8rem] font-light text-app-muted">
                    {p.kind}
                    {p.subject ? ` · ${p.subject}` : ''}
                    {p.publishedAt
                      ? ` · published ${new Date(p.publishedAt).toLocaleDateString('en-NZ')}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={STATUS[p.status]} />
                  {p.status === 'published' && (
                    <Link
                      href={`/blog/${p.slug}`}
                      className="rounded-lg border border-app-border px-3 py-1.5 text-[0.82rem] font-light text-app-ink"
                    >
                      View
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => edit(p)}
                    className="rounded-lg border border-app-border px-3 py-1.5 text-[0.82rem] font-light text-app-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deletePost(p.id)
                        if (res.error) setError(res.error)
                      })
                    }
                    className="rounded-lg border border-app-border px-3 py-1.5 text-[0.82rem] font-light text-app-bad disabled:opacity-60"
                  >
                    Delete
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
