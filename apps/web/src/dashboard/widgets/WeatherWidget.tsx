import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from '../../weather/data/useWeather'
import { DailyList } from '../../weather/DailyList'
import { HourlyStrip } from '../../weather/HourlyStrip'
import { conditionLook } from '../../weather/lib/conditionLook'
import { formatTemp } from '../../weather/lib/format'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { StaleNote, staleSx } from '../../weather/StaleNote'
import { tileSpan, type TileSize } from '../lib/tileSize'
import { missingWeather } from './lib/missingWeather'
import { TodayOutlook } from '../../weather/TodayOutlook'
import { WidgetMessage } from './WidgetMessage'

type Props = { weather: Weather; size: TileSize }

/**
 * The weather card. 1×1: icon, temperature and condition. 2×1 adds today's high, low and rain chance;
 * 1×2 lists the next 6 hours; 2×2 shows the next hours and 5 days.
 */
export function WeatherWidget({ weather, size }: Props) {
  const { current } = weather
  if (!current) return <WidgetMessage text={missingWeather(weather.status)} />
  const wide = tileSpan(size).cols === 2
  const today = weather.daily[0]
  const { label } = conditionLook(current.condition, current.isDay)
  const now = (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, ...staleSx(weather) }}>
      <WeatherIcon condition={current.condition} isDay={current.isDay} decorative sx={{ fontSize: 36 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography component="p" sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
          {formatTemp(current.tempC)}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{label}</Typography>
      </Box>
      {wide && today && <TodayOutlook today={today} />}
    </Stack>
  )
  return (
    <Stack spacing={1.5} sx={{ height: '100%', p: 2, overflow: 'hidden' }}>
      {now}
      <StaleNote weather={weather} />
      {size === 'T1x2' && <HourlyStrip hourly={weather.hourly} limit={6} vertical />}
      {size === 'L2x2' && (
        <>
          <HourlyStrip hourly={weather.hourly} limit={6} />
          <DailyList daily={weather.daily} limit={5} dense />
        </>
      )}
    </Stack>
  )
}
