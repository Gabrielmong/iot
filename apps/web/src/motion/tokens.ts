import type { Transition, Variants } from 'framer-motion'

/** Snappy spring for things that answer a tap (toggles, knobs, presses). */
export const snappy: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }

/** Softer spring for things that move into place (cards, tiles, layout shifts). */
export const settle: Transition = { type: 'spring', stiffness: 260, damping: 30 }

export const easeOut = [0.2, 0.8, 0.2, 1] as const

/** Parent of a staggered reveal: children use `riseItem`. */
export const staggerParent: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

/** A child that rises and fades in. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.38, ease: easeOut } },
}
