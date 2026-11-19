import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from '../../weather/data/useWeather'
import { daylightLeft, moonPhase } from './lib/moon'
import { useNow } from './useNow'
import { WidgetMessage } from './WidgetMessage'

/** The moon's phase and how lit it is, with the daylight left today (or the time to sunrise). */
export function MoonWidget({ sun }: { sun: Weather['sun'] }) {
  const now = useNow()
  if (!sun) return <WidgetMessage text="Set the home location" />
  const moon = moonPhase(now)
  const left = daylightLeft(sun, now)
  return (
    <Stack spacing={0.5} sx={{ height: '100%', p: 2, overflow: 'hidden' }}>
      <DarkModeOutlinedIcon sx={{ color: 'text.secondary' }} aria-hidden />
      <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{moon.name}</Typography>
      <Typography variant="body2" color="text.secondary">{`${Math.round(moon.fraction * 100)}% lit`}</Typography>
      {left && <Typography variant="body2" color="text.secondary">{left}</Typography>}
    </Stack>
  )
}
