'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  FileText,
  KeyRound,
  Link2,
  MapPin,
  MessageSquare,
  StickyNote,
  Users,
  Video,
} from 'lucide-react'
import {
  CLASS_MODE_LABEL,
  formatMoney,
  formatWhen,
  refundPreview,
  type ClassMaterial,
  type ClassRegistration,
  type ClassSession,
  type ForumTopic,
  type MaterialKind,
} from '@/lib/class-types'
import {
  cancelClassRegistration,
  enterClass,
  postTopic,
  registerForClass,
} from '@/app/portal/class-actions'

const MATERIAL_ICON: Record<MaterialKind, typeof FileText> = {
  document: FileText,
  video: Video,
  link: Link2,
  notes: StickyNote,
  assignment: FileText,
}

export default function ClassRoom({
  session,
  registration,
  seatsLeft,
  waitlistLeft,
  materials,
  topics,
  signedIn,
  inRoom,
}: {
  session: ClassSession
  registration: ClassRegistration | null
  seatsLeft: number
  waitlistLeft: number
  materials: ClassMaterial[]
  topics: ForumTopic[]
  signedIn: boolean
  /** True once the database is willing to show materials and the class forum. */
  inRoom: boolean
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0">
        <p className="text-[0.8rem] font-medium tracking-wide text-accent uppercase">
          {session.subject}
          {session.year_level ? ` · ${session.year_level}` : ''}
        </p>
        <h1 className="mt-3 text-[clamp(1.9rem,5vw,3rem)] leading-[1.08] font-extrabold tracking-tight text-ink">
          {session.title}
        </h1>
        <p className="mt-3 text-[1rem] font-light text-ink-dim">
          with {session.teacher_name}
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <Fact icon={CalendarDays} term="When">
            {formatWhen(session.starts_at, session.ends_at)}
          </Fact>
          <Fact icon={session.mode === 'classroom' ? MapPin : Video} term="Where">
            {CLASS_MODE_LABEL[session.mode]}
            {session.location ? ` · ${session.location}` : ''}
          </Fact>
          <Fact icon={Users} term="Seats">
            {seatsLeft > 0
              ? `${seatsLeft} of ${session.capacity} left`
              : `Full (${session.capacity} places)`}
          </Fact>
          <Fact icon={KeyRound} term="Price">
            {formatMoney(session.price_cents, session.currency)}
          </Fact>
        </dl>

        {session.topics && (
          <section className="mt-10">
            <h2 className="text-[1.15rem] font-semibold text-ink">What we cover</h2>
            <p className="mt-3 leading-relaxed font-light whitespace-pre-line text-ink-dim">
              {session.topics}
            </p>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-[1.15rem] font-semibold text-ink">Cancellations</h2>
          <p className="mt-3 max-w-prose leading-relaxed font-light text-ink-dim">
            Cancel more than {session.refund_full_hours} hours before the start and you get
            everything back. Between {session.refund_partial_hours} and{' '}
            {session.refund_full_hours} hours it is {session.refund_partial_pct}%. Inside{' '}
            {session.refund_partial_hours} hours the seat is not refundable — by then
            nobody else can take it.
          </p>
        </section>

        {inRoom ? (
          <>
            <Materials materials={materials} session={session} />
            <ClassForum classId={session.id} topics={topics} />
          </>
        ) : (
          <LockedRoom session={session} registration={registration} />
        )}
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <RegistrationPanel
          session={session}
          registration={registration}
          seatsLeft={seatsLeft}
          waitlistLeft={waitlistLeft}
          signedIn={signedIn}
        />
      </aside>
    </div>
  )
}

function Fact({
  icon: Icon,
  term,
  children,
}: {
  icon: typeof CalendarDays
  term: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-base-raised p-4">
      <Icon size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0">
        <dt className="text-[0.78rem] font-medium text-ink-dim">{term}</dt>
        <dd className="mt-1 text-[0.92rem] font-light text-ink">{children}</dd>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registering
// ---------------------------------------------------------------------------

function RegistrationPanel({
  session,
  registration,
  seatsLeft,
  waitlistLeft,
  signedIn,
}: {
  session: ClassSession
  registration: ClassRegistration | null
  seatsLeft: number
  waitlistLeft: number
  signedIn: boolean
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const live = registration && registration.status !== 'cancelled'

  function register() {
    setError(null)
    setMessage(null)
    start(async () => {
      const res = await registerForClass(session.id)
      if (res.error) {
        setError(res.error)
        return
      }
      const o = res.outcome
      if (!o) return

      if (o.outcome === 'confirmed') {
        setMessage(`You are in. Your access code is ${o.access_code}.`)
      } else if (o.outcome === 'offered') {
        setMessage(
          `A seat is held for you. Pay ${formatMoney(o.amount_due_cents, session.currency)} to confirm it.`,
        )
      } else if (o.outcome === 'waitlisted') {
        setMessage(
          `The class is full. You are number ${o.waitlist_position} on the waiting list — we will let you know the moment a seat frees up.`,
        )
      }
    })
  }

  async function pay() {
    setError(null)
    const res = await fetch('/api/class-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: session.id }),
    })
    const body = (await res.json()) as { url?: string; error?: string }
    if (body.error || !body.url) {
      setError(body.error ?? 'Could not start the payment.')
      return
    }
    window.location.href = body.url
  }

  function cancel() {
    setError(null)
    setMessage(null)
    start(async () => {
      const res = await cancelClassRegistration(session.id)
      if (res.error) setError(res.error)
      else setMessage(res.refundReason ?? 'Your registration is cancelled.')
    })
  }

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-hairline bg-base-raised p-6">
        <p className="text-[1.4rem] font-semibold text-ink">
          {formatMoney(session.price_cents, session.currency)}
        </p>
        <p className="mt-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
          Sign in to take a seat. Registering gives you the class code, the material and
          the class forum.
        </p>
        <Link
          href="/sign-in"
          className="mt-5 block rounded-full bg-accent px-6 py-3 text-center text-[0.92rem] font-medium text-[#100c00]"
        >
          Sign in to register
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-hairline bg-base-raised p-6">
      <p className="text-[1.4rem] font-semibold text-ink">
        {formatMoney(session.price_cents, session.currency)}
      </p>

      {live ? (
        <>
          <p className="mt-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
            {registration.status === 'confirmed' &&
              'You have a seat in this class. Your code is below.'}
            {registration.status === 'offered' &&
              'A seat is being held for you until you pay for it.'}
            {registration.status === 'waitlisted' &&
              `You are number ${registration.waitlist_position} on the waiting list.`}
          </p>

          {registration.status === 'confirmed' && session.access_code && (
            <p className="mt-4 rounded-xl bg-accent/10 px-4 py-3 text-center">
              <span className="block text-[0.75rem] font-medium text-ink-dim">
                Your access code
              </span>
              <span className="mt-1 block font-mono text-[1.3rem] font-semibold tracking-[0.2em] text-accent">
                {session.access_code}
              </span>
            </p>
          )}

          {registration.status === 'offered' && (
            <button
              type="button"
              onClick={pay}
              className="mt-5 w-full rounded-full bg-accent px-6 py-3 text-[0.92rem] font-medium text-[#100c00]"
            >
              Pay {formatMoney(session.price_cents, session.currency)}
            </button>
          )}

          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="mt-3 w-full rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink hover:border-ink/40 disabled:opacity-60"
          >
            {pending ? 'Working…' : 'Cancel my registration'}
          </button>

          {registration.paid && registration.amount_paid_cents > 0 && (
            <p className="mt-3 text-center text-[0.8rem] font-light text-ink-dim">
              {refundPreview(session, registration.amount_paid_cents).note}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-[0.9rem] leading-relaxed font-light text-ink-dim">
            {seatsLeft > 0
              ? `${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'} still open.`
              : waitlistLeft > 0
                ? `The class is full, but ${waitlistLeft} waiting-list ${waitlistLeft === 1 ? 'place is' : 'places are'} open. You move up when someone cancels.`
                : 'This class is full and the waiting list is closed. Please try again later — we run these regularly.'}
          </p>

          <button
            type="button"
            onClick={register}
            disabled={pending || (seatsLeft === 0 && waitlistLeft === 0)}
            className="mt-5 w-full rounded-full bg-accent px-6 py-3 text-[0.92rem] font-medium text-[#100c00] disabled:opacity-50"
          >
            {pending
              ? 'Working…'
              : seatsLeft > 0
                ? 'Register'
                : waitlistLeft > 0
                  ? 'Join the waiting list'
                  : 'No seats available'}
          </button>
        </>
      )}

      {message && (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[0.87rem] leading-relaxed font-light text-ink"
        >
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[0.87rem] leading-relaxed text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The room itself
// ---------------------------------------------------------------------------

/**
 * What a student sees before the room opens. The reason is spelled out, because
 * "nothing posted" and "not yours to see yet" look identical otherwise.
 */
function LockedRoom({
  session,
  registration,
}: {
  session: ClassSession
  registration: ClassRegistration | null
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const confirmed = registration?.status === 'confirmed'
  const started = session.status === 'in_progress' || session.status === 'completed'

  return (
    <section className="mt-10 rounded-2xl border border-dashed border-hairline p-6 sm:p-8">
      <h2 className="text-[1.15rem] font-semibold text-ink">The class room</h2>

      {!confirmed ? (
        <p className="mt-3 max-w-prose leading-relaxed font-light text-ink-dim">
          Material and the class forum open to students with a confirmed seat. Register
          above and you will get a code.
        </p>
      ) : !started ? (
        <p className="mt-3 max-w-prose leading-relaxed font-light text-ink-dim">
          Your seat is confirmed. {session.teacher_name} releases the material when the
          class starts — come back then and enter your code.
        </p>
      ) : (
        <>
          <p className="mt-3 max-w-prose leading-relaxed font-light text-ink-dim">
            The class has started. Enter your access code to open the material and the
            class forum.
          </p>
          <form
            className="mt-5 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              start(async () => {
                const res = await enterClass(code)
                if (res.error) setError(res.error)
              })
            }}
          >
            <label htmlFor="class-code" className="sr-only">
              Access code
            </label>
            <input
              id="class-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-40 rounded-full border border-hairline bg-base px-5 py-3 text-center font-mono text-[1rem] tracking-[0.2em] text-ink"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-accent px-7 py-3 text-[0.9rem] font-medium text-[#100c00] disabled:opacity-60"
            >
              {pending ? 'Checking…' : 'Enter'}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-[0.87rem] text-red-400">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Materials({
  materials,
  session,
}: {
  materials: ClassMaterial[]
  session: ClassSession
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[1.15rem] font-semibold text-ink">Class material</h2>

      {materials.length === 0 ? (
        <p className="mt-3 max-w-prose leading-relaxed font-light text-ink-dim">
          {session.teacher_name} has not posted anything yet, or the window for it has
          closed. Material stays available for {session.materials_days} days after the
          class.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {materials.map((m) => {
            const Icon = MATERIAL_ICON[m.kind]
            return (
              <li
                key={m.id}
                className="flex items-start gap-4 rounded-xl border border-hairline bg-base-raised p-4"
              >
                <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.95rem] font-medium text-ink">
                    {m.external_url ? (
                      <a
                        href={m.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {m.title}
                      </a>
                    ) : (
                      m.title
                    )}
                  </p>
                  {m.description && (
                    <p className="mt-1 text-[0.87rem] leading-relaxed font-light text-ink-dim">
                      {m.description}
                    </p>
                  )}
                  {m.body && (
                    <p className="mt-2 text-[0.87rem] leading-relaxed font-light whitespace-pre-line text-ink-dim">
                      {m.body}
                    </p>
                  )}
                  {m.available_until && (
                    <p className="mt-2 text-[0.78rem] font-light text-ink-dim">
                      Available until{' '}
                      {new Date(m.available_until).toLocaleDateString('en-NZ', {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ClassForum({ classId, topics }: { classId: string; topics: ForumTopic[] }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <section className="mt-10">
      <h2 className="text-[1.15rem] font-semibold text-ink">Class forum</h2>
      <p className="mt-2 max-w-prose text-[0.92rem] leading-relaxed font-light text-ink-dim">
        Ask about anything from this class. Only the people in it can read this.
      </p>

      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          start(async () => {
            const res = await postTopic({ title, body, classId })
            if (res.error) setError(res.error)
            else {
              setTitle('')
              setBody('')
            }
          })
        }}
      >
        <label htmlFor="ct-title" className="sr-only">
          Question
        </label>
        <input
          id="ct-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is your question?"
          className="rounded-xl border border-hairline bg-base-raised px-5 py-3 text-[0.92rem] font-light text-ink placeholder:text-white/30"
        />
        <label htmlFor="ct-body" className="sr-only">
          Details
        </label>
        <textarea
          id="ct-body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Give a bit of detail — which problem, what you have tried."
          className="rounded-xl border border-hairline bg-base-raised px-5 py-3 text-[0.92rem] font-light text-ink placeholder:text-white/30"
        />
        {error && (
          <p role="alert" className="text-[0.87rem] text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00] disabled:opacity-60"
        >
          {pending ? 'Posting…' : 'Post to the class'}
        </button>
      </form>

      {topics.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {topics.map((t) => (
            <li key={t.id} className="rounded-xl border border-hairline bg-base-raised p-4">
              <Link
                href={`/forum/${t.id}`}
                className="text-[0.95rem] font-medium text-ink hover:underline"
              >
                {t.title}
              </Link>
              <p className="mt-1.5 line-clamp-2 text-[0.87rem] leading-relaxed font-light text-ink-dim">
                {t.body}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[0.8rem] font-light text-ink-dim">
                <MessageSquare size={13} aria-hidden />
                {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'} ·{' '}
                {t.author_name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
