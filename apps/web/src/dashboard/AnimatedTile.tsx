import { motion, type Variants } from 'framer-motion'
import { forwardRef, type ReactNode } from 'react'
import { easeOut, settle } from '../motion/tokens'
import { canToggle, opensDetailsOnTap } from './lib/capabilities'
import { tileSpan, type TileSize } from './lib/tileSize'
import type { Device } from './types'

type Props = { device: Device; size: TileSize; children: ReactNode }

const tile: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: easeOut } },
}

/**
 * A grid cell spanning its card size. It rises in (staggered by the grid on first load), glides when
 * the grid reflows, shrinks away when filtered out, and gives under a press.
 */
export const AnimatedTile = forwardRef<HTMLDivElement, Props>(function AnimatedTile({ device, size, children }, ref) {
  const pressable = canToggle(device) || opensDetailsOnTap(device)
  const { cols, rows } = tileSpan(size)
  return (
    <motion.div
      ref={ref}
      data-tile-size={size}
      layout="position"
      variants={tile}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
      whileTap={pressable ? { scale: 0.97 } : undefined}
      transition={settle}
      style={{ minWidth: 0, gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
    >
      {children}
    </motion.div>
  )
})
