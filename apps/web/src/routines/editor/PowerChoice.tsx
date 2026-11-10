import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

type Value = boolean | null
type Props = { value: Value; allowLeave: boolean; wakeOnly?: boolean; onChange: (on: Value) => void }

const KEY = { on: true, off: false, leave: null } as const
const keyOf = (v: Value) => (v === true ? 'on' : v === false ? 'off' : 'leave')

/** Power for a routine step: On, Off, or (lights) Leave as is. A computer only wakes. */
export function PowerChoice({ value, allowLeave, wakeOnly = false, onChange }: Props) {
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      aria-label="Power"
      value={keyOf(value)}
      onChange={(_, key: keyof typeof KEY | null) => key && onChange(KEY[key])}
    >
      <ToggleButton value="on">{wakeOnly ? 'Wake' : 'On'}</ToggleButton>
      {!wakeOnly && <ToggleButton value="off">Off</ToggleButton>}
      {allowLeave && <ToggleButton value="leave">Leave as is</ToggleButton>}
    </ToggleButtonGroup>
  )
}
