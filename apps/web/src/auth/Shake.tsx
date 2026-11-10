import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Shakes its children side to side each time `trigger` changes (after the first value). */
export function Shake({ trigger, children }: { trigger: number; children: ReactNode }) {
  return (
    <motion.div
      key={trigger}
      initial={{ x: 0 }}
      animate={trigger > 0 ? { x: [0, -12, 12, -8, 8, -3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {children}
    </motion.div>
  )
}
