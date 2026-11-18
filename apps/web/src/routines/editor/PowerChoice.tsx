import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

type Value = boolean | null
type Props = { value: Value; allowLeave: boolean; onChange: (on: Value) => void }

const KEY = { on: true, off: false, leave: null } as const
const keyOf = (v: Value) => (v === true ? 'on' : v === false ? 'off' : 'leave')

/** Power for a routine step: On, Off, or (lights) Leave as is. PCs use PcPowerChoice. */
export function PowerChoice({ value, allowLeave, onChange }: Props) {
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      aria-label="Power"
      value={keyOf(value)}
      onChange={(_, key: keyof typeof KEY | null) => key && onChange(KEY[key])}
    >
      <ToggleButton value="on">On</ToggleButton>
      <ToggleButton value="off">Off</ToggleButton>
      {allowLeave && <ToggleButton value="leave">Leave as is</ToggleButton>}
    </ToggleButtonGroup>
  )
}
