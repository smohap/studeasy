'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { checkout, removeFromCart } from '@/app/shop/actions'
import { formatPrice } from '@/lib/catalog'
import type { CartLine } from '@/lib/shop-data'

export default function CartView({ lines }: { lines: CartLine[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)

  const total = lines.reduce((sum, l) => sum + l.course.price_cents, 0)

  function remove(courseId: string) {
    setError(null)
    start(async () => {
      const result = await removeFromCart(courseId)
      if (result.error) setError(result.error)
      router.refresh()
    })
  }

  function pay() {
    setError(null)
    start(async () => {
      const result = await checkout()
      if (result.error) {
        setError(result.error)
        return
      }
      setReference(result.reference ?? null)
      router.refresh()
    })
  }

  if (reference) {
    return (
      <div className="mt-10 rounded-2xl border border-hairline bg-base-raised p-8">
        <CheckCircle2 size={26} aria-hidden className="text-accent" strokeWidth={1.6} />
        <h2 className="mt-4 text-[1.3rem] font-semibold tracking-tight text-ink">
          You&rsquo;re enrolled
        </h2>
        <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
          Order <span className="font-mono text-ink">{reference}</span>. Your courses are
          in your portal now.
        </p>
        <p className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.07] p-4 text-[0.86rem] leading-relaxed font-light text-ink">
          No payment was taken. Card processing is not connected yet, so this order was
          recorded and enrolled without charging anything.
        </p>
        <Link
          href="/portal/student"
          className="mt-6 inline-block rounded-full bg-accent px-7 py-3 text-[0.92rem] font-medium text-[#100c00]"
        >
          Go to my courses
        </Link>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
        <p className="text-[1rem] font-medium text-ink">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed font-light text-ink-dim">
          Browse the catalog and add a course, or start with the free diagnostic.
        </p>
        <Link
          href="/courses"
          className="mt-6 inline-block rounded-full border border-hairline px-6 py-3 text-[0.9rem] font-light text-ink"
        >
          Browse courses
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-10">
      <ul className="flex flex-col gap-3">
        {lines.map((l) => (
          <li
            key={l.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-hairline bg-base-raised p-5"
          >
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden className="text-[1.5rem]">
                {l.course.emoji ?? '📘'}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/courses/${l.course.slug}`}
                  className="text-[0.98rem] font-medium text-ink hover:underline"
                >
                  {l.course.title}
                </Link>
                <p className="mt-0.5 text-[0.85rem] font-light text-ink-dim">
                  {l.course.teacher_name} · {l.course.subject}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-[0.98rem] font-semibold text-ink">
                {formatPrice(l.course.price_cents, l.course.currency)}
              </span>
              <button
                type="button"
                onClick={() => remove(l.course.id)}
                disabled={pending}
                className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-ink-dim transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-50"
              >
                <span className="sr-only">Remove {l.course.title}</span>
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-2xl border border-hairline bg-base-raised p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[1rem] font-light text-ink-dim">Total</span>
          <span className="text-[1.6rem] font-semibold tracking-tight text-ink">
            {formatPrice(total)}
          </span>
        </div>

        <button
          type="button"
          onClick={pay}
          disabled={pending}
          className="mt-6 w-full rounded-full bg-accent px-8 py-4 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-50"
        >
          {pending ? 'Completing…' : 'Complete enrolment'}
        </button>

        <p className="mt-4 text-[0.82rem] leading-relaxed font-light text-ink-dim">
          Card payment is not connected yet. This records the order and enrols you without
          taking any money.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-[0.88rem] font-light text-[#F0A0A0]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
