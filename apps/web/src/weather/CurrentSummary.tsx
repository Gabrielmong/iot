import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from './data/useWeather'
import { conditionLook } from './lib/conditionLook'
import { formatTemp } from './lib/format'
import { WeatherIcon } from './WeatherIcon'

type Props = { current: NonNullable<Weather['current']>; dense?: boolean }

/** The temperature, the condition and (unless dense) feels-like, humidity and wind. */
export function CurrentSummary({ current, dense = false }: Props) {
  const { label } = conditionLook(current.condition, current.isDay)
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <WeatherIcon condition={current.condition} isDay={current.isDay} decorative sx={{ fontSize: dense ? 36 : 56 }} />
      <Stack>
        <Typography component="p" sx={{ fontSize: dense ? 32 : 48, fontWeight: 700, lineHeight: 1.1 }}>
          {formatTemp(current.tempC)}
        </Typography>
        <Typography color="text.secondary">{label}</Typography>
        {!dense && (
          <Typography variant="body2" color="text.secondary">
            {`Feels like ${formatTemp(current.feelsLikeC)} · Humidity ${current.humidity}% · Wind ${Math.round(current.windKph)} km/h`}
          </Typography>
        )}
      </Stack>
    </Stack>
  )
}
