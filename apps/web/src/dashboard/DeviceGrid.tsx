import Box from '@mui/material/Box'
import { AnimatePresence, motion } from 'framer-motion'
import type { Weather } from '../weather/data/useWeather'
import { AnimatedTile } from './AnimatedTile'
import { canToggle, opensDetailsOnTap } from './lib/capabilities'
import { gridSx } from './lib/gridSx'
import type { ArrangedTile } from './lib/reconcileLayout'
import { DeviceTile } from './tile/DeviceTile'
import type { Device } from './types'
import { widgetShows } from './widgets/widgetKinds'
import { WidgetTile } from './widgets/WidgetTile'

type Props = {
  tiles: readonly ArrangedTile[]
  weather?: Weather
  isAdmin: boolean
  onToggle: (device: Device) => void
  onOpenDetails: (device: Device) => void
}

const cascade = { hidden: {}, shown: { transition: { staggerChildren: 0.035 } } }

/**
 * Responsive tile grid: 2 columns on phones, 3–4 on tablets, 6 on desktop, each card spanning its size.
 * Tiles cascade in on first load; switching rooms slides the remaining tiles into their new places.
 * Widgets with nothing to show (weather off or not set up) are left out; their place is kept in the layout.
 */
export function DeviceGrid({ tiles, weather, isAdmin, onToggle, onOpenDetails }: Props) {
  const shown = tiles.filter((t) => !('widget' in t) || widgetShows(t.widget, weather))
  return (
    <Box component={motion.div} variants={cascade} initial="hidden" animate="shown" sx={gridSx}>
      <AnimatePresence mode="popLayout">
        {shown.map((tile) =>
          'device' in tile ? (
            <AnimatedTile key={tile.key} pressable={canToggle(tile.device) || opensDetailsOnTap(tile.device)} size={tile.size}>
              <DeviceTile device={tile.device} isAdmin={isAdmin} onToggle={onToggle} onOpenDetails={onOpenDetails} />
            </AnimatedTile>
          ) : (
            <AnimatedTile key={tile.key} pressable size={tile.size}>
              <WidgetTile kind={tile.widget} size={tile.size} weather={weather} />
            </AnimatedTile>
          ),
        )}
      </AnimatePresence>
    </Box>
  )
}
