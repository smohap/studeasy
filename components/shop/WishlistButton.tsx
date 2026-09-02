'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { toggleWishlist } from '@/app/shop/actions'

export default function WishlistButton({
  courseId,
  saved,
  signedIn,
  returnTo,
  wide,
}: {
  courseId: string
  /** Server-rendered starting state, from isWishlisted(). */
  saved: boolean
  signedIn: boolean
  /** Where to send someone who has to sign in first. */
  returnTo?: string
  wide?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [on, setOn] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    if (!signedIn) {
      // The sign-in page does not read `next` yet — AddToCartButton passes it
      // too. Kept the same so wiring it up later fixes both at once.
      router.push(`/sign-in?next=${encodeURIComponent(returnTo ?? '/courses')}`)
      return
    }
    setError(null)

    // Flip immediately — the point of a save button is that it feels instant.
    // The server's answer below is what actually decides.
    const optimistic = !on
    setOn(optimistic)

    start(async () => {
      const result = await toggleWishlist(courseId)
      if (result.error) {
        setOn(!optimistic)
        setError(result.error)
        return
      }
      setOn(result.state === 'added')
      router.refresh()
    })
  }

  return (
    <div className={wide ? 'w-full' : undefined}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={on}
        className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-[0.86rem] font-light transition-colors disabled:opacity-60 ${
          on ? 'border-accent text-accent' : 'border-hairline text-ink hover:border-ink/40'
        } ${wide ? 'w-full py-3 text-[0.9rem]' : ''}`}
      >
        <Heart size={15} aria-hidden fill={on ? 'currentColor' : 'none'} />
        {on ? 'Saved' : 'Save for later'}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </div>
  )
}
