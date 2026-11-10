import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

/** On/off switch for any switchable device. */
type Props = { on: boolean; disabled?: boolean; onChange: (on: boolean) => void }

export function PowerSwitch({ on, disabled = false, onChange }: Props) {
  return (
    <FormControlLabel
      label="Power"
      disabled={disabled}
      control={<Switch checked={on} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { role: 'switch' } }} />}
    />
  )
}
