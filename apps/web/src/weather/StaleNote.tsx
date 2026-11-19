import Typography from '@mui/material/Typography'
import type { Weather } from './data/useWeather'
import { formatUpdated } from './lib/format'

/** Dims a reading that's out of date. */
export const staleSx = (weather: Weather) => (weather.stale ? { opacity: 0.6 } : {})

/** "Updated 3 h ago" under a reading that's out of date; nothing while it's fresh. */
export function StaleNote({ weather }: { weather: Weather }) {
  if (!weather.stale || !weather.updatedAt) return null
  return (
    <Typography variant="caption" color="warning.main" noWrap>
      {formatUpdated(weather.updatedAt)}
    </Typography>
  )
}
