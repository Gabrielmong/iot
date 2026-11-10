import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { easeOut } from './tokens'

/** Fades a page in with a short rise when it mounts. Key it by route to replay on navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: easeOut }}
    >
      {children}
    </motion.div>
  )
}
