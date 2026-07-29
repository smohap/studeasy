import { useCallback, useRef } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'
import { useMotionOff } from './motion'

/**
 * Subtle magnetic pull toward the cursor. The element's box is measured once on
 * pointer enter and reused for the move handler, so nothing reads layout inside
 * the high-frequency path.
 *
 * Inert for touch/coarse pointers and when reduced motion is requested.
 */
export function useMagnetic(strength = 0.18) {
  const off = useMotionOff()
  const rect = useRef<DOMRect | null>(null)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, { stiffness: 180, damping: 18, mass: 0.4 })
  const y = useSpring(rawY, { stiffness: 180, damping: 18, mass: 0.4 })

  const onPointerEnter = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (off || e.pointerType !== 'mouse') return
      rect.current = e.currentTarget.getBoundingClientRect()
    },
    [off],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const r = rect.current
      if (off || !r || e.pointerType !== 'mouse') return
      rawX.set((e.clientX - (r.left + r.width / 2)) * strength)
      rawY.set((e.clientY - (r.top + r.height / 2)) * strength)
    },
    [off, rawX, rawY, strength],
  )

  const onPointerLeave = useCallback(() => {
    rect.current = null
    rawX.set(0)
    rawY.set(0)
  }, [rawX, rawY])

  return {
    magneticProps: { onPointerEnter, onPointerMove, onPointerLeave },
    style: off ? {} : { x, y, willChange: 'transform' },
  }
}
