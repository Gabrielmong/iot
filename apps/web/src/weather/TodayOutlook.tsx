import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Weather } from './data/useWeather'
import { formatTemp } from './lib/format'

type Props = { today: Weather['daily'][number] }

/** Today's high and low, and the chance of rain. */
export function TodayOutlook({ today }: Props) {
  return (
    <Stack sx={{ alignItems: 'flex-end', ml: 'auto', minWidth: 0 }}>
      <Typography variant="body2" noWrap>{`H ${formatTemp(today.maxC)} · L ${formatTemp(today.minC)}`}</Typography>
      <Typography variant="body2" color="info.main" noWrap>{`Rain ${today.rainChance}%`}</Typography>
    </Stack>
  )
}
