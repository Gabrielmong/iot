import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { tileSpan, type TileSize } from '../lib/tileSize'
import { useNow } from './useNow'

/** The time, large, and the date; seconds hidden. Wider cards spell out the weekday and month. */
export function ClockWidget({ size }: { size: TileSize }) {
  const now = useNow()
  const wide = tileSpan(size).cols === 2
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString(undefined, wide ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', day: 'numeric' })
  return (
    <Stack sx={{ height: '100%', p: 2, justifyContent: 'center', overflow: 'hidden' }}>
      <Typography component="p" sx={{ fontSize: wide ? 44 : 32, fontWeight: 700, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }} noWrap>
        {time}
      </Typography>
      <Typography variant="body2" color="text.secondary" noWrap>
        {date}
      </Typography>
    </Stack>
  )
}
