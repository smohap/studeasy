'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { removeFromCart } from '@/app/shop/actions'
import { formatPrice } from '@/lib/catalog'
import type { CartLine } from '@/lib/shop-data'

export default function CartView({ lines }: { lines: CartLine[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
      const res = await fetch('/api/checkout', { method: 'POST' })
      const body = (await res.json()) as { url?: string; error?: string }

      if (!res.ok || !body.url) {
        setError(body.error ?? 'Could not start checkout.')
        return
      }
      // Either Stripe's hosted page, or our own confirmation for a free order.
      window.location.assign(body.url)
    })
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
          {pending ? 'Taking you to payment…' : total === 0 ? 'Enrol' : 'Pay securely'}
        </button>

        <p className="mt-4 text-[0.82rem] leading-relaxed font-light text-ink-dim">
          {total === 0
            ? 'Nothing to pay. You will be enrolled straight away.'
            : 'Payment is handled by Stripe. We never see your card details.'}
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
