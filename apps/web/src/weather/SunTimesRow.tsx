import WbTwilightIcon from '@mui/icons-material/WbTwilight'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from './data/useWeather'
import { formatClock } from './lib/format'

type Props = { sun: NonNullable<Weather['sun']> }

/** Today's sunrise and sunset; a polar day or night has no times. */
export function SunTimesRow({ sun }: Props) {
  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <WbTwilightIcon color="warning" />
      <Typography>{`Sunrise ${sun.sunrise ? formatClock(sun.sunrise) : '—'}`}</Typography>
      <Typography>{`Sunset ${sun.sunset ? formatClock(sun.sunset) : '—'}`}</Typography>
    </Stack>
  )
}
