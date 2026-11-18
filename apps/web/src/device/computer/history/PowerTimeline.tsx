import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { PowerSegment } from './powerSegments'

const UNKNOWN = 'repeating-linear-gradient(45deg, rgba(159,176,221,0.18) 0 4px, transparent 4px 8px)'

function fill(on: boolean | null) {
  if (on === true) return { bgcolor: 'success.main' }
  if (on === false) return { bgcolor: 'action.disabledBackground' }
  return { backgroundImage: UNKNOWN }
}

type Props = { segments: PowerSegment[]; startLabel: string }

/** A horizontal bar: green while on, grey while off, hatched where the state is not known. */
export function PowerTimeline({ segments, startLabel }: Props) {
  const from = segments[0]!.start.getTime()
  const span = segments.at(-1)!.end.getTime() - from || 1
  const pct = (ms: number) => `${(ms / span) * 100}%`
  return (
    <Stack spacing={0.5}>
      <Box role="img" aria-label="On/off timeline" sx={{ position: 'relative', height: 20, borderRadius: '6px', overflow: 'hidden', bgcolor: 'action.hover' }}>
        {segments.map((s) => (
          <Box
            key={s.start.getTime()}
            sx={{ position: 'absolute', top: 0, bottom: 0, left: pct(s.start.getTime() - from), width: pct(s.end.getTime() - s.start.getTime()), ...fill(s.on) }}
          />
        ))}
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {startLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Now
        </Typography>
      </Stack>
    </Stack>
  )
}
