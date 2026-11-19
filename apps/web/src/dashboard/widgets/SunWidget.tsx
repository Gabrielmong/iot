import WbTwilightIcon from '@mui/icons-material/WbTwilight'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from '../../weather/data/useWeather'
import { formatClock } from '../../weather/lib/format'
import type { TileSize } from '../lib/tileSize'
import { daylight, sunEvents } from './lib/sunEvents'
import { WidgetMessage } from './WidgetMessage'

type Props = { sun: Weather['sun']; size: TileSize }

/** Sunrise and sunset: the next one large, the other small; bigger cards add the length of daylight. */
export function SunWidget({ sun, size }: Props) {
  const events = sun ? sunEvents(sun) : null
  if (!sun || !events) return <WidgetMessage text={sun ? 'No sunrise or sunset today' : 'No sun times yet'} />
  const length = size === 'S1x1' ? null : daylight(sun)
  return (
    <Stack spacing={0.5} sx={{ height: '100%', p: 2, overflow: 'hidden' }}>
      <WbTwilightIcon color="warning" aria-hidden />
      <Typography variant="body2" color="text.secondary">{events.next.label}</Typography>
      <Typography component="p" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{formatClock(events.next.at)}</Typography>
      <Typography variant="body2" color="text.secondary" noWrap>{`${events.other.label} ${formatClock(events.other.at)}`}</Typography>
      {length && <Typography variant="body2" color="text.secondary">{length}</Typography>}
    </Stack>
  )
}
