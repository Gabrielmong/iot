import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { riseItem, staggerParent } from './tokens'

type Props = { children: ReactNode; className?: string }

/** Container whose `RevealItem` children rise in one after another. */
export function RevealGroup({ children, className }: Props) {
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" animate="shown">
      {children}
    </motion.div>
  )
}

/** One staggered child of a `RevealGroup`. */
export function RevealItem({ children, className }: Props) {
  return (
    <motion.div className={className} variants={riseItem}>
      {children}
    </motion.div>
  )
}
