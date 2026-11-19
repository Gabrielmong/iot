import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { CurrentSummary } from './CurrentSummary'
import { DailyList } from './DailyList'
import type { Weather } from './data/useWeather'
import { HourlyStrip } from './HourlyStrip'
import { formatUpdated } from './lib/format'
import { SunTimesRow } from './SunTimesRow'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" component="h2" color="text.secondary" sx={{ mb: 1 }}>{title}</Typography>
      {children}
    </Paper>
  )
}

/** Everything the weather page shows when there's a reading: one column on phones; on wider screens now and the
 * next hours on the left, the next days and the sun on the right. */
export function WeatherDetails({ weather }: { weather: Weather }) {
  return (
    <Stack spacing={2}>
      {weather.stale && weather.updatedAt && <Alert severity="warning">{formatUpdated(weather.updatedAt)}</Alert>}
      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
        <Stack spacing={2}>
          {weather.current && (
            <Paper variant="outlined" sx={{ p: 2, opacity: weather.stale ? 0.6 : 1 }}>
              <CurrentSummary current={weather.current} />
              {!weather.stale && weather.updatedAt && (
                <Typography variant="caption" color="text.secondary">{formatUpdated(weather.updatedAt)}</Typography>
              )}
            </Paper>
          )}
          {weather.hourly.length > 0 && <Card title="Next hours"><HourlyStrip hourly={weather.hourly} /></Card>}
        </Stack>
        <Stack spacing={2}>
          {weather.daily.length > 0 && <Card title="Next days"><DailyList daily={weather.daily} /></Card>}
          {weather.sun && <Card title="Sun"><SunTimesRow sun={weather.sun} /></Card>}
        </Stack>
      </Box>
    </Stack>
  )
}
