import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Weather } from './data/useWeather'
import { formatDay, formatTemp } from './lib/format'
import { WeatherIcon } from './WeatherIcon'

type Props = { daily: Weather['daily']; limit?: number; dense?: boolean }

/** One row per day: the day, its icon, the chance of rain (not when dense), and the low and high. */
export function DailyList({ daily, limit, dense = false }: Props) {
  const days = limit ? daily.slice(0, limit) : daily
  return (
    <Box component="ul" aria-label="Next days" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {days.map((d) => (
        <Box component="li" key={d.date} sx={{ display: 'grid', gridTemplateColumns: dense ? '2.75rem 1.5rem 1fr' : '4.5rem 2rem 3rem 1fr', alignItems: 'center', gap: 1, py: dense ? 0.25 : 0.75 }}>
          <Typography variant={dense ? 'body2' : 'body1'} sx={{ fontWeight: 600 }}>{formatDay(d.date)}</Typography>
          <WeatherIcon condition={d.condition} fontSize="small" />
          {!dense && <Typography variant="body2" color="info.main">{d.rainChance >= 20 ? `${d.rainChance}%` : ''}</Typography>}
          <Typography variant="body2" sx={{ textAlign: 'right' }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>{formatTemp(d.minC)}</Box>
            {` / ${formatTemp(d.maxC)}`}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
