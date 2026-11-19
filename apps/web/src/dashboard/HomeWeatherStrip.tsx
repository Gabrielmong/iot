import Box from '@mui/material/Box'
import { useIsDesktop } from '../layout/useIsDesktop'
import { WeatherStrip } from '../weather/WeatherStrip'
import type { ArrangedTile } from './lib/reconcileLayout'

/** On a phone, the weather row at the top of Home, unless Home already has a weather widget. */
export function HomeWeatherStrip({ tiles }: { tiles: readonly ArrangedTile[] }) {
  const desktop = useIsDesktop()
  if (desktop || tiles.some((t) => 'widget' in t && t.widget === 'WEATHER')) return null
  return (
    <Box sx={{ mt: 1.5 }}>
      <WeatherStrip />
    </Box>
  )
}
