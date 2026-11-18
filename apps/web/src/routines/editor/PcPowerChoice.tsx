import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import type { RoutinePcPower } from '../lib/draft'

type Value = 'WAKE' | RoutinePcPower
type Props = { value: Value; agent: boolean; onChange: (value: Value) => void }

/** Power for a PC in a routine: Wake, and with HomeAgent also Sleep or Shut down (never Restart). */
export function PcPowerChoice({ value, agent, onChange }: Props) {
  return (
    <ToggleButtonGroup exclusive fullWidth aria-label="Power" value={value} onChange={(_, v: Value | null) => v && onChange(v)}>
      <ToggleButton value="WAKE">Wake</ToggleButton>
      {agent && <ToggleButton value="SLEEP">Sleep</ToggleButton>}
      {agent && <ToggleButton value="SHUTDOWN">Shut down</ToggleButton>}
    </ToggleButtonGroup>
  )
}
