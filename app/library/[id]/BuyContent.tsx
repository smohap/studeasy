'use client'

import { useState } from 'react'

/**
 * The buy button, and only that.
 *
 * A client island on an otherwise server-rendered page, because entitlement and
 * the signed download link are decided on the server — this needs to be
 * interactive, the rest does not.
 */
export default function BuyContent({
  contentId,
  priceCents,
  currency,
}: {
  contentId: string
  priceCents: number
  currency: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const price = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: currency || 'NZD',
  }).format(priceCents / 100)

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setError(null)
          setBusy(true)
          try {
            const res = await fetch('/api/content-checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contentId }),
            })
            const body = (await res.json()) as { url?: string; error?: string }
            if (body.error || !body.url) {
              setError(body.error ?? 'Could not start the payment.')
              setBusy(false)
              return
            }
            window.location.href = body.url
          } catch {
            setError('Could not reach the payment page. Try again.')
            setBusy(false)
          }
        }}
        className="w-full rounded-full bg-accent px-6 py-3 text-[0.95rem] font-medium text-[#100c00] disabled:opacity-60"
      >
        {busy ? 'Opening checkout…' : `Buy for ${price}`}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-[0.87rem] leading-relaxed text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
