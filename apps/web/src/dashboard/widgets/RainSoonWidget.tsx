import UmbrellaOutlinedIcon from '@mui/icons-material/UmbrellaOutlined'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from '../../weather/data/useWeather'
import { rainSoon, rainSoonText } from './lib/rainSoon'
import { useNow } from './useNow'

/** Whether rain is coming in the next 12 hours, from the hourly forecast. */
export function RainSoonWidget({ weather }: { weather: Weather }) {
  const now = useNow()
  const rain = rainSoon(weather.hourly, now)
  return (
    <Stack direction="row" spacing={1.5} sx={{ height: '100%', p: 2, alignItems: 'center', overflow: 'hidden' }}>
      <UmbrellaOutlinedIcon color={rain ? 'info' : 'disabled'} aria-hidden />
      <Typography sx={{ fontWeight: 600, lineHeight: 1.25 }}>{rainSoonText(rain)}</Typography>
    </Stack>
  )
}
