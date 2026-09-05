'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Upload,
  XCircle,
} from 'lucide-react'
import {
  attachAttemptUpload,
  startAttempt,
  submitAttempt,
} from '@/app/portal/assessment-actions'
import { createClient } from '@/lib/supabase/client'
import type { AssessmentAccess } from '@/lib/assessments-data'
import type { Assessment, AttemptResult, PaperQuestion } from '@/lib/assessment-types'

type Responses = Record<string, string | string[]>

/** The last quarter of an hour is when it starts to matter. */
const WARN_FROM_MS = 15 * 60 * 1000

/** h:mm:ss, or mm:ss under an hour. */
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return h > 0 ? `${h}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}

export default function TakePaper({
  assessment,
  paper,
  access,
}: {
  assessment: Assessment
  paper: PaperQuestion[]
  access: AssessmentAccess
}) {
  const [pending, start] = useTransition()
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [responses, setResponses] = useState<Responses>({})
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<string | null>(null)

  const total = paper.reduce((sum, q) => sum + q.marks, 0)

  /*
   * There is no per-question view here — the whole paper renders at once —
   * so "shown" resets when the attempt itself begins rather than per
   * question. Every answer in one submission carries the same elapsed time;
   * a paginated paper would reset this per question instead.
   */
  const shownAt = useRef<number>(Date.now())
  useEffect(() => {
    shownAt.current = Date.now()
  }, [attemptId])

  // Clamped to twenty minutes: a tab left open overnight is not time on task.
  function elapsedSeconds(): number {
    return Math.min(1200, Math.round((Date.now() - shownAt.current) / 1000))
  }

  /*
   * Only true once a deadline exists and has passed — an untimed assessment
   * has `remaining === null` and must never lock.
   */
  const timeUp = remaining != null && remaining <= 0

  /*
   * What gets handed in for one question.
   *
   * Ordering is the exception to "untouched means unanswered". The list is
   * already in an order on screen from the moment the paper loads, so a student
   * who agrees with the shuffle and moves nothing has still given an answer —
   * sending null there would mark a genuinely wrong sequence as needing a
   * human, and quietly put the whole paper in the teacher's queue. Every other
   * kind starts genuinely blank, and blank stays null.
   */
  const responseFor = useCallback(
    (q: PaperQuestion): string | string[] | null => {
      const given = responses[q.id]
      if (given !== undefined) return given
      if (q.kind === 'ordering') return q.payload.items ?? null
      return null
    },
    [responses],
  )

  const finish = useCallback(() => {
    if (!attemptId) return
    setError(null)
    start(async () => {
      const r = await submitAttempt(
        attemptId,
        paper.map((q) => ({
          question_id: q.id,
          response: responseFor(q),
          seconds_spent: elapsedSeconds(),
        })),
      )
      if (r.error) {
        setError(r.error)
        return
      }
      setResult(r.result ?? null)
    })
  }, [attemptId, paper, responseFor])

  /*
   * The countdown runs off the server's deadline, not a duration the browser
   * started counting. Reloading re-reads the same deadline, so the clock cannot
   * be reset — which is the whole of "cannot pause it".
   *
   * Auto-submitting at zero is a courtesy, so the student's answers are kept.
   * close_expired_attempts() is what actually guarantees the attempt closes,
   * because a shut tab runs no timers at all.
   */
  useEffect(() => {
    if (!deadline || result) return

    const tick = () => {
      const left = new Date(deadline).getTime() - Date.now()
      setRemaining(left)
      if (left <= 0) finish()
    }

    tick()
    const handle = setInterval(tick, 1000)
    return () => clearInterval(handle)
  }, [deadline, result, finish])

  function begin() {
    setError(null)
    start(async () => {
      const r = await startAttempt(assessment.id)
      if (r.error) {
        setError(r.error)
        return
      }
      setAttemptId(r.attemptId ?? null)
      setDeadline(r.deadline ?? null)
    })
  }

  /** Offline answers go straight to Storage; only the path comes back here. */
  async function upload(file: File) {
    if (!attemptId) return
    setError(null)
    setUploading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Your session expired. Sign in and try again.')

      // The bucket's policies key off the first path segment being the owner.
      const path = `${user.id}/${attemptId}/${file.name}`
      const { error: upErr } = await supabase.storage
        .from('assessment-uploads')
        .upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)

      const res = await attachAttemptUpload(attemptId, path, file.name)
      if (res.error) throw new Error(res.error)

      setUploaded(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That upload did not work.')
    } finally {
      setUploading(false)
    }
  }

  function set(id: string, value: string | string[]) {
    setResponses((r) => ({ ...r, [id]: value }))
  }

  function toggle(id: string, option: string) {
    const current = (responses[id] as string[]) ?? []
    set(
      id,
      current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
    )
  }

  /*
   * matching — the response is a set of "leftIndex:rightIndex" strings, the
   * same encoding buildPayloadAndCorrect() stores as the answer. Indices
   * rather than the text itself, so a pair whose wording contains a colon or
   * an equals sign cannot break marking. mark_answer() compares matching as an
   * unordered set, so a row left blank is simply an entry that is not there.
   */
  function matchChoice(id: string, leftIndex: number): string {
    const current = (responses[id] as string[]) ?? []
    const hit = current.find((pair) => pair.startsWith(`${leftIndex}:`))
    return hit ? hit.slice(hit.indexOf(':') + 1) : ''
  }

  function setMatch(id: string, leftIndex: number, rightIndex: string) {
    const current = ((responses[id] as string[]) ?? []).filter(
      (pair) => !pair.startsWith(`${leftIndex}:`),
    )
    set(id, rightIndex === '' ? current : [...current, `${leftIndex}:${rightIndex}`])
  }

  /*
   * ordering — the response is the item strings in the student's sequence, so
   * before they touch anything it is the shuffled list exactly as served.
   * Seeding it from the payload rather than leaving it empty means "I did not
   * reorder these" submits the order on screen, which is what the student sees
   * and therefore what they meant.
   */
  function orderOf(q: PaperQuestion): string[] {
    return (responses[q.id] as string[]) ?? q.payload.items ?? []
  }

  function move(q: PaperQuestion, index: number, delta: number) {
    const list = [...orderOf(q)]
    const target = index + delta
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    set(q.id, list)
  }

  /*
   * formula — inserts at the caret rather than appending, because a symbol is
   * almost always wanted in the middle of what has been typed. Falls back to
   * appending if the field is not focused.
   */
  function insertSymbol(id: string, symbol: string) {
    const el = document.getElementById(`formula-${id}`) as HTMLInputElement | null
    const value = (responses[id] as string) ?? ''

    if (!el) {
      set(id, value + symbol)
      return
    }

    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + symbol + value.slice(end)
    set(id, next)

    // After React has re-rendered with the new value, put the caret after the
    // symbol just inserted rather than at the end of the field.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + symbol.length, start + symbol.length)
    })
  }

  // ---- Finished -----------------------------------------------------------
  if (result) {
    const pct =
      result.max_marks > 0 ? Math.round((result.auto_marks / result.max_marks) * 100) : 0
    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-8">
        {result.needs_marking ? (
          <Clock size={26} aria-hidden className="text-accent" strokeWidth={1.6} />
        ) : result.passed ? (
          <CheckCircle2 size={26} aria-hidden className="text-accent" strokeWidth={1.6} />
        ) : (
          <XCircle size={26} aria-hidden className="text-[#E88A8A]" strokeWidth={1.6} />
        )}

        <h2 className="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink">
          {result.needs_marking
            ? 'Handed in — some of it needs your teacher'
            : result.passed
              ? 'Passed'
              : 'Not passed this time'}
        </h2>

        <p className="mt-3 text-[0.98rem] leading-relaxed font-light text-ink-dim">
          {result.needs_marking ? (
            <>
              The auto-marked part scored {result.auto_marks} of {result.max_marks}. Your
              written answers are with your teacher, so the final mark and any certificate
              follow once they release it.
            </>
          ) : (
            <>
              You scored {result.auto_marks} of {result.max_marks} ({pct}%). The pass mark is{' '}
              {assessment.pass_mark_pct}%.
            </>
          )}
        </p>

        {!result.needs_marking && result.passed && assessment.issues_certificate && (
          <p className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.07] p-4 text-[0.9rem] leading-relaxed font-light text-ink">
            Your certificate has been issued — it is on your achievements page.
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/portal/student/achievements"
            className="rounded-full bg-accent px-7 py-3 text-[0.92rem] font-medium text-[#100c00]"
          >
            See achievements
          </Link>
          <Link
            href="/portal/student"
            className="rounded-full border border-hairline px-7 py-3 text-[0.92rem] font-light text-ink"
          >
            Back to portal
          </Link>
        </div>
      </div>
    )
  }

  // ---- Not started --------------------------------------------------------
  if (!attemptId) {
    const when = (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleString('en-NZ', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })
        : null

    const notYet = assessment.opens_at && new Date(assessment.opens_at) > new Date()
    const over = assessment.closes_at && new Date(assessment.closes_at) <= new Date()

    /*
     * Entitlement and timing are answered separately so the message is the
     * true one. "You have not paid for this" and "you are too late" are very
     * different things to be told.
     */
    if (!access.canTake) {
      return (
        <div className="rounded-2xl border border-hairline bg-base-raised p-8">
          <h2 className="text-[1.2rem] font-semibold text-ink">
            {assessment.price_cents > 0 ? 'This one is paid for' : 'Not open to you'}
          </h2>
          <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
            {assessment.class_id
              ? 'It is set for the students registered in its class. Register for the class and it is included.'
              : assessment.course_id
                ? 'It comes with a course you are not enrolled in yet.'
                : assessment.price_cents > 0
                  ? 'Buy it once and you can sit it whenever it is open.'
                  : 'You do not have access to this assessment.'}
          </p>

          {assessment.price_cents > 0 && !assessment.class_id && !assessment.course_id && (
            <button
              type="button"
              onClick={async () => {
                setError(null)
                const res = await fetch('/api/assessment-checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ assessmentId: assessment.id }),
                })
                const body = (await res.json()) as { url?: string; error?: string }
                if (body.error || !body.url) {
                  setError(body.error ?? 'Could not start the payment.')
                  return
                }
                window.location.href = body.url
              }}
              className="mt-6 rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00]"
            >
              Buy for{' '}
              {new Intl.NumberFormat('en-NZ', {
                style: 'currency',
                currency: assessment.currency || 'NZD',
              }).format(assessment.price_cents / 100)}
            </button>
          )}

          {error && (
            <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
              {error}
            </p>
          )}
        </div>
      )
    }

    if (notYet || over) {
      return (
        <div className="rounded-2xl border border-hairline bg-base-raised p-8">
          <Clock size={26} aria-hidden className="text-accent" strokeWidth={1.6} />
          <h2 className="mt-4 text-[1.2rem] font-semibold text-ink">
            {notYet ? 'Not open yet' : 'This has closed'}
          </h2>
          <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
            {notYet
              ? `It opens ${when(assessment.opens_at)}.`
              : `It closed ${when(assessment.closes_at)}.`}
          </p>
        </div>
      )
    }

    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-8">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Fact label="Questions" value={String(paper.length)} />
          <Fact label="Total marks" value={String(total)} />
          <Fact label="Pass mark" value={`${assessment.pass_mark_pct}%`} />
          <Fact
            label="Time limit"
            value={
              assessment.time_limit_minutes
                ? `${assessment.time_limit_minutes} min`
                : 'None'
            }
          />
        </dl>

        {assessment.delivery === 'classroom' && (
          <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[0.9rem] leading-relaxed font-light text-ink">
            Sat in person at <span className="font-medium">{assessment.location}</span>
            {assessment.opens_at && <> on {when(assessment.opens_at)}</>}. Your teacher
            records the mark afterwards.
          </p>
        )}

        {assessment.delivery === 'offline' && (
          <div className="mt-6">
            {assessment.paper_url && (
              <a
                href={assessment.paper_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink hover:border-ink/40"
              >
                <Download size={15} aria-hidden />
                Download the paper
              </a>
            )}
            <p className="mt-4 text-[0.88rem] leading-relaxed font-light text-ink-dim">
              {assessment.allow_upload
                ? 'Work through it, then start below and attach your answers as a PDF or Word file.'
                : 'Work through it and hand your answers to your teacher.'}
              {assessment.closes_at && <> Due by {when(assessment.closes_at)}.</>}
            </p>
          </div>
        )}

        {assessment.time_limit_minutes && assessment.delivery === 'online' && (
          <p className="mt-6 text-[0.88rem] leading-relaxed font-light text-ink-dim">
            The clock starts when you press Start and does not stop. Closing this page or
            signing out does not pause it, so begin when you have{' '}
            {assessment.time_limit_minutes} clear minutes.
          </p>
        )}

        {assessment.negative_marking && (
          <p className="mt-4 text-[0.88rem] leading-relaxed font-light text-ink-dim">
            Negative marking is on: a wrong answer costs a mark, so leave one blank if you
            genuinely do not know.
          </p>
        )}

        <button
          type="button"
          onClick={begin}
          disabled={pending || (assessment.delivery === 'online' && paper.length === 0)}
          className="mt-7 rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Starting…' : assessment.delivery === 'online' ? 'Start' : 'Begin'}
        </button>

        {assessment.delivery === 'online' && paper.length === 0 && (
          <p className="mt-4 text-[0.9rem] font-light text-ink-dim">
            This assessment has no questions yet.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
            {error}
          </p>
        )}
      </div>
    )
  }

  // ---- Offline: the work is in the file, not on this page -------------------
  if (assessment.delivery !== 'online') {
    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-8">
        <h2 className="text-[1.2rem] font-semibold text-ink">
          {assessment.delivery === 'offline' ? 'Hand in your answers' : 'Sat in person'}
        </h2>

        {assessment.delivery === 'offline' && assessment.allow_upload ? (
          <>
            <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
              Attach your answers as a PDF or Word file, then hand it in. Your teacher
              marks it and releases the result.
            </p>

            <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink hover:border-ink/40">
              <Upload size={15} aria-hidden />
              {uploading ? 'Uploading…' : uploaded ? 'Choose a different file' : 'Choose a file'}
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) upload(file)
                }}
              />
            </label>

            {uploaded && (
              <p role="status" className="mt-3 text-[0.88rem] font-light text-accent">
                Attached: {uploaded}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
            {assessment.delivery === 'offline'
              ? 'Give your answers to your teacher directly. Hand in below so they know you are done.'
              : 'Your teacher records the mark after the sitting. Hand in below so they know you attended.'}
          </p>
        )}

        <button
          type="button"
          onClick={finish}
          disabled={pending || (assessment.allow_upload && !uploaded)}
          className="mt-7 rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Handing in…' : 'Hand in'}
        </button>

        {error && (
          <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
            {error}
          </p>
        )}
      </div>
    )
  }

  // ---- In progress --------------------------------------------------------
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        finish()
      }}
    >
      {remaining != null && (
        <p
          role="timer"
          /*
           * Announced only inside the last fifteen minutes. A countdown read
           * aloud every second for an hour would make the paper unusable with a
           * screen reader; silence until it matters, then speak.
           */
          aria-live={timeUp ? 'assertive' : remaining < WARN_FROM_MS ? 'polite' : 'off'}
          className={`sticky top-4 z-10 mb-5 rounded-full border px-5 py-2.5 text-center text-[0.95rem] font-medium tabular-nums ${
            remaining < WARN_FROM_MS
              ? 'border-[#F0A0A0]/50 bg-[#F0A0A0]/12 text-[#F0A0A0]'
              : 'border-hairline bg-base-raised text-ink'
          }`}
        >
          {timeUp ? (
            'Time is up — handing your answers in'
          ) : (
            <>
              {clock(remaining)} left
              <span className="ml-2 font-light opacity-70">
                {remaining < WARN_FROM_MS
                  ? '— finish up'
                  : '— this does not pause'}
              </span>
            </>
          )}
        </p>
      )}

      {/*
        * Locking the whole paper in one native fieldset rather than threading a
        * disabled prop through every input: once the clock hits zero nothing
        * should be answerable, and a single control missed would be a way to
        * keep working after time was up.
        */}
      <fieldset disabled={timeUp} className="contents">
      <ol className="flex flex-col gap-5">
        {paper.map((q, i) => (
          <li key={q.id} className="rounded-2xl border border-hairline bg-base-raised p-6">
            <fieldset>
              <legend className="text-[1rem] leading-snug font-medium text-ink">
                <span className="text-ink-dim">{i + 1}. </span>
                {q.prompt}
                <span className="ml-2 text-[0.8rem] font-light text-ink-dim">
                  ({q.marks} {q.marks === 1 ? 'mark' : 'marks'})
                </span>
              </legend>

              <div className="mt-4">
                {(q.kind === 'mcq' || q.kind === 'true_false') && (
                  <div className="flex flex-col gap-2">
                    {(q.payload.options ?? []).map((o) => (
                      <label
                        key={o}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline px-4 py-3 text-[0.94rem] font-light text-ink"
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value={o}
                          checked={responses[q.id] === o}
                          onChange={() => set(q.id, o)}
                          className="h-4 w-4 accent-[#E3B341]"
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                )}

                {q.kind === 'multi_select' && (
                  <div className="flex flex-col gap-2">
                    {(q.payload.options ?? []).map((o) => (
                      <label
                        key={o}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline px-4 py-3 text-[0.94rem] font-light text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={((responses[q.id] as string[]) ?? []).includes(o)}
                          onChange={() => toggle(q.id, o)}
                          className="h-4 w-4 accent-[#E3B341]"
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                )}

                {(q.kind === 'numerical' ||
                  q.kind === 'fill_blank' ||
                  q.kind === 'short_answer') && (
                  <input
                    type={q.kind === 'numerical' ? 'number' : 'text'}
                    step="any"
                    value={(responses[q.id] as string) ?? ''}
                    onChange={(e) => set(q.id, e.target.value)}
                    aria-label={`Answer for question ${i + 1}`}
                    className="w-full rounded-xl border border-hairline bg-base px-4 py-3 text-[0.95rem] font-light text-ink"
                  />
                )}

                {q.kind === 'matching' && (
                  <div className="flex flex-col gap-2">
                    {(q.payload.left ?? []).map((leftText, li) => (
                      <div
                        key={leftText}
                        className="grid items-center gap-3 rounded-xl border border-hairline px-4 py-3 sm:grid-cols-2"
                      >
                        <span className="text-[0.94rem] font-light text-ink">
                          {leftText}
                        </span>
                        <select
                          value={matchChoice(q.id, li)}
                          onChange={(e) => setMatch(q.id, li, e.target.value)}
                          aria-label={`Match for ${leftText}`}
                          className="w-full rounded-lg border border-hairline bg-base px-3 py-2 text-[0.9rem] font-light text-ink"
                        >
                          <option value="">Choose…</option>
                          {(q.payload.right ?? []).map((rightText, ri) => (
                            <option key={rightText} value={String(ri)}>
                              {rightText}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <p className="mt-1 text-[0.82rem] font-light text-ink-dim">
                      Each answer can be used more than once — nothing stops you
                      picking the same one twice, and nothing marks you down for
                      the order you fill them in.
                    </p>
                  </div>
                )}

                {q.kind === 'ordering' && (
                  <ol className="flex flex-col gap-2">
                    {orderOf(q).map((item, idx) => (
                      <li
                        key={item}
                        className="flex items-center gap-3 rounded-xl border border-hairline px-4 py-3"
                      >
                        <span className="w-6 shrink-0 text-[0.86rem] font-medium text-accent tabular-nums">
                          {idx + 1}.
                        </span>
                        <span className="flex-1 text-[0.94rem] font-light text-ink">
                          {item}
                        </span>
                        <span className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => move(q, idx, -1)}
                            disabled={idx === 0}
                            aria-label={`Move ${item} up`}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-hairline text-ink disabled:opacity-30"
                          >
                            <ChevronUp size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(q, idx, 1)}
                            disabled={idx === orderOf(q).length - 1}
                            aria-label={`Move ${item} down`}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-hairline text-ink disabled:opacity-30"
                          >
                            <ChevronDown size={14} aria-hidden />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {q.kind === 'formula' && (
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      id={`formula-${q.id}`}
                      value={(responses[q.id] as string) ?? ''}
                      onChange={(e) => set(q.id, e.target.value)}
                      aria-label={`Answer for question ${i + 1}`}
                      className="w-full rounded-xl border border-hairline bg-base px-4 py-3 font-mono text-[0.98rem] font-light text-ink"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {(q.payload.symbols ?? []).map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => insertSymbol(q.id, sym)}
                          aria-label={`Insert ${sym}`}
                          className="h-9 min-w-9 rounded-lg border border-hairline px-2 font-mono text-[0.92rem] text-ink hover:border-ink/40"
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                    <p className="text-[0.82rem] font-light text-ink-dim">
                      Your answer is compared as written, not solved — so give
                      it in the form the question asks for.
                    </p>
                  </div>
                )}

                {q.kind === 'image' && (
                  <div className="flex flex-col gap-4">
                    {q.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={q.image_url}
                        alt={`Diagram for question ${i + 1}. It is described in the question above.`}
                        className="max-h-96 w-auto rounded-xl border border-hairline"
                      />
                    ) : (
                      <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-[0.9rem] font-light text-ink-dim">
                        The diagram for this question could not be loaded. Tell
                        your tutor before you answer — do not guess at what it
                        showed.
                      </p>
                    )}
                    <textarea
                      rows={5}
                      value={(responses[q.id] as string) ?? ''}
                      onChange={(e) => set(q.id, e.target.value)}
                      aria-label={`Answer for question ${i + 1}`}
                      className="w-full rounded-xl border border-hairline bg-base px-4 py-3 text-[0.95rem] font-light text-ink"
                    />
                  </div>
                )}

                {q.kind === 'essay' && (
                  <textarea
                    rows={6}
                    value={(responses[q.id] as string) ?? ''}
                    onChange={(e) => set(q.id, e.target.value)}
                    aria-label={`Answer for question ${i + 1}`}
                    className="w-full rounded-xl border border-hairline bg-base px-4 py-3 text-[0.95rem] font-light text-ink"
                  />
                )}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      </fieldset>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-hairline pt-6">
        <button
          type="submit"
          disabled={pending || timeUp}
          className="rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Marking…' : timeUp ? 'Time is up' : 'Hand in'}
        </button>
        <span className="text-[0.86rem] font-light text-ink-dim">
          {paper.filter((q) => responseFor(q) !== null).length} of {paper.length}{' '}
          answered
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </form>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 text-[1rem] font-medium text-ink">{value}</dd>
    </div>
  )
}
