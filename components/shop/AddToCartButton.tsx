'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { addToCart } from '@/app/shop/actions'

export default function AddToCartButton({
  courseId,
  free,
  signedIn,
  wide,
}: {
  courseId: string
  free: boolean
  signedIn: boolean
  wide?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'added' | 'enrolled'>('idle')
  const [error, setError] = useState<string | null>(null)

  const label = free ? 'Book free' : 'Add to cart'

  function onClick() {
    if (!signedIn) {
      router.push(`/sign-in?next=/courses`)
      return
    }
    setError(null)
    start(async () => {
      const result = await addToCart(courseId)
      if (result.error) {
        setError(result.error)
        return
      }
      setState(result.state === 'already_enrolled' ? 'enrolled' : 'added')
      router.refresh()
    })
  }

  return (
    <div className={wide ? 'w-full' : undefined}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || state !== 'idle'}
        className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.86rem] font-medium transition-colors disabled:cursor-default ${
          state === 'idle'
            ? 'bg-accent text-[#100c00] hover:brightness-105'
            : 'border border-hairline bg-transparent text-ink'
        } ${wide ? 'w-full py-3.5 text-[0.95rem]' : ''}`}
      >
        {state === 'added' && <Check size={15} aria-hidden />}
        {state === 'idle' && (pending ? 'Adding…' : label)}
        {state === 'added' && 'In your cart'}
        {state === 'enrolled' && 'Already enrolled'}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </div>
  )
}
