import { useReducedMotion, type Variants } from 'framer-motion'

/** Reference easing — slow in, settle out. Used for every enter animation. */
export const EASE = [0.25, 0.1, 0.25, 1] as const

/** Animate once, when roughly a third of the element has entered the viewport. */
export const VIEWPORT = { once: true, amount: 0.3 } as const

/**
 * Enter animation for a group of siblings. Children fade up in sequence so a
 * section resolves as one gesture rather than eight competing ones.
 */
export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
}

/**
 * True when the reader has asked for reduced motion. Every scroll-driven
 * transform in this site is gated on this returning false.
 */
export function useMotionOff(): boolean {
  return useReducedMotion() === true
}
