import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import type { DeviceHealth } from '../lib/deviceStatus'
import { HEALTH_COLOR, HEALTH_LABEL } from '../lib/deviceStatus'

type Props = { counts: Record<DeviceHealth, number>; active: DeviceHealth | 'any'; onPick: (health: DeviceHealth | 'any') => void }

const PROBLEMS: DeviceHealth[] = ['setup', 'offline']

/** Always-visible problem counts ("Needs setup · 2", "Offline · 1"); clicking one filters to it, again clears it. */
export function HealthCounts({ counts, active, onPick }: Props) {
  return (
    <Stack direction="row" spacing={1}>
      {PROBLEMS.map((health) => {
        const selected = active === health
        return (
          <Chip
            key={health}
            label={`${HEALTH_LABEL[health]} · ${counts[health]}`}
            color={counts[health] > 0 ? HEALTH_COLOR[health] : 'default'}
            variant={selected ? 'filled' : 'outlined'}
            aria-pressed={selected}
            onClick={() => onPick(selected ? 'any' : health)}
          />
        )
      })}
    </Stack>
  )
}
