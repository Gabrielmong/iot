import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { useCurrentUser } from '../auth/useCurrentUser'
import { useWeather } from './data/useWeather'
import { conditionLook } from './lib/conditionLook'
import { formatTemp } from './lib/format'
import { StaleNote, staleSx } from './StaleNote'
import { TodayOutlook } from './TodayOutlook'
import { WeatherIcon } from './WeatherIcon'

const rowSx = { display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderRadius: '10px', textDecoration: 'none', color: 'inherit' } as const

/**
 * The phone home's weather row: now and today, opening the weather page. Nothing while loading, while
 * weather is off or not set up, or without a reading; admins get a nudge to set the home location.
 */
export function WeatherStrip() {
  const { weather } = useWeather()
  const { user } = useCurrentUser()
  if (!weather) return null
  if (weather.status === 'NO_LOCATION') {
    if (user?.role !== 'ADMIN') return null
    return (
      <Link component={RouterLink} to="/admin/settings" sx={{ px: 2, py: 1 }}>
        Set the home location
      </Link>
    )
  }
  const { current } = weather
  if (!current || weather.status === 'NOT_CONFIGURED' || weather.status === 'DISABLED') return null
  const today = weather.daily[0]
  return (
    <Paper variant="outlined" component={RouterLink} to="/weather" sx={rowSx}>
      <WeatherIcon condition={current.condition} isDay={current.isDay} decorative sx={{ fontSize: 32, ...staleSx(weather) }} />
      <Stack sx={{ minWidth: 0, ...staleSx(weather) }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{formatTemp(current.tempC)}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {conditionLook(current.condition, current.isDay).label}
        </Typography>
        <StaleNote weather={weather} />
      </Stack>
      {today && <TodayOutlook today={today} />}
    </Paper>
  )
}
