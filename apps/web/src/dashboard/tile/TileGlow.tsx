import { AnimatePresence, motion } from 'framer-motion'
import type { TileGlow as Glow } from '../lib/tileGlow'

const layer = { position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit' } as const

/** The light a lit device casts across its tile, fading in and out as it switches. Decorative. */
export function TileGlow({ glow }: { glow: Glow | null }) {
  return (
    <AnimatePresence>
      {glow && (
        <motion.div
          key="glow"
          aria-hidden
          data-testid="tile-glow"
          style={{
            ...layer,
            background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${glow.color} 38%, transparent), transparent 70%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: glow.strength }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        />
      )}
    </AnimatePresence>
  )
}
