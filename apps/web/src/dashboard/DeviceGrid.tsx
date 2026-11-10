import Box from '@mui/material/Box'
import { AnimatePresence, motion } from 'framer-motion'
import { AnimatedTile } from './AnimatedTile'
import { gridSx } from './lib/gridSx'
import type { ArrangedTile } from './lib/reconcileLayout'
import { DeviceTile } from './tile/DeviceTile'
import type { Device } from './types'

type Props = {
  tiles: readonly ArrangedTile[]
  isAdmin: boolean
  onToggle: (device: Device) => void
  onOpenDetails: (device: Device) => void
}

const cascade = { hidden: {}, shown: { transition: { staggerChildren: 0.035 } } }

/**
 * Responsive tile grid: 2 columns on phones, 3–4 on tablets, 6 on desktop, each card spanning its size.
 * Tiles cascade in on first load; switching rooms slides the remaining tiles into their new places.
 */
export function DeviceGrid({ tiles, isAdmin, onToggle, onOpenDetails }: Props) {
  return (
    <Box component={motion.div} variants={cascade} initial="hidden" animate="shown" sx={gridSx}>
      <AnimatePresence mode="popLayout">
        {tiles.map(({ device, size }) => (
          <AnimatedTile key={device.id} device={device} size={size}>
            <DeviceTile device={device} isAdmin={isAdmin} onToggle={onToggle} onOpenDetails={onOpenDetails} />
          </AnimatedTile>
        ))}
      </AnimatePresence>
    </Box>
  )
}
