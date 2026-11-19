import Box from '@mui/material/Box'
import { AnimatePresence, motion } from 'framer-motion'
import { AnimatedTile } from './AnimatedTile'
import { canToggle, opensDetailsOnTap } from './lib/capabilities'
import { gridSx } from './lib/gridSx'
import type { ArrangedTile } from './lib/reconcileLayout'
import { DeviceTile } from './tile/DeviceTile'
import type { Device } from './types'
import { widgetAvailable } from './widgets/lib/widgetAvailable'
import { LiveSlotsProvider } from './widgets/live/LiveSlotsProvider'
import { NO_WIDGET_DATA, type WidgetData } from './widgets/useWidgetData'
import { WidgetTile } from './widgets/WidgetTile'

type Props = {
  tiles: readonly ArrangedTile[]
  data?: WidgetData
  isAdmin: boolean
  onToggle: (device: Device) => void
  onOpenDetails: (device: Device) => void
}

const cascade = { hidden: {}, shown: { transition: { staggerChildren: 0.035 } } }

/**
 * Responsive tile grid: 2 columns on phones, 3–4 on tablets, 6 on desktop, each card spanning its size.
 * Tiles cascade in on first load; switching rooms slides the remaining tiles into their new places.
 * Widgets with nothing to show (weather off, a routine or camera gone) are left out; their place is kept in the layout.
 */
export function DeviceGrid({ tiles, data = NO_WIDGET_DATA, isAdmin, onToggle, onOpenDetails }: Props) {
  const shown = tiles.filter((t) => !('widget' in t) || widgetAvailable(t, data))
  return (
    <LiveSlotsProvider>
    <Box component={motion.div} variants={cascade} initial="hidden" animate="shown" sx={gridSx}>
      <AnimatePresence mode="popLayout">
        {shown.map((tile) =>
          'device' in tile ? (
            <AnimatedTile key={tile.key} pressable={canToggle(tile.device) || opensDetailsOnTap(tile.device)} size={tile.size}>
              <DeviceTile device={tile.device} isAdmin={isAdmin} onToggle={onToggle} onOpenDetails={onOpenDetails} />
            </AnimatedTile>
          ) : (
            <AnimatedTile key={tile.key} pressable size={tile.size}>
              <WidgetTile tile={tile} data={data} />
            </AnimatedTile>
          ),
        )}
      </AnimatePresence>
    </Box>
    </LiveSlotsProvider>
  )
}
