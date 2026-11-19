import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Weather } from './data/useWeather'
import { formatHour, formatTemp } from './lib/format'
import { WeatherIcon } from './WeatherIcon'

type Props = { hourly: Weather['hourly']; limit?: number; vertical?: boolean }

/** The next hours, side by side (scrolling sideways when they don't fit), or one per row when vertical. */
export function HourlyStrip({ hourly, limit, vertical = false }: Props) {
  const hours = limit ? hourly.slice(0, limit) : hourly
  return (
    <Box
      component="ul"
      aria-label="Next hours"
      sx={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 0.5 : 1, justifyContent: vertical ? undefined : 'space-between', overflowX: vertical ? 'hidden' : 'auto', listStyle: 'none', p: 0, m: 0, pb: 0.5 }}
    >
      {hours.map((h) => (
        <Box
          component="li"
          key={h.time}
          sx={vertical ? { display: 'grid', gridTemplateColumns: '1fr auto 2.5rem', alignItems: 'center', gap: 1 } : { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44, gap: 0.5 }}
        >
          <Typography variant="caption" color="text.secondary">{formatHour(h.time)}</Typography>
          <WeatherIcon condition={h.condition} fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 600, textAlign: vertical ? 'right' : undefined }}>{formatTemp(h.tempC)}</Typography>
          {!vertical && h.rainChance >= 20 && <Typography variant="caption" color="info.main">{`${h.rainChance}%`}</Typography>}
        </Box>
      ))}
    </Box>
  )
}
