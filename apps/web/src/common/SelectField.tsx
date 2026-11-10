import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'

export type SelectOption = { value: string; label: string }
type Props = { label: string; value: string; options: readonly SelectOption[]; onChange: (value: string) => void; size?: 'small' | 'medium' }

/** A labelled MUI select with a themed menu (not the browser's native dropdown). */
export function SelectField({ label, value, options, onChange, size }: Props) {
  return (
    <TextField
      select
      fullWidth
      size={size}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // Options like "No room" use "": show them and keep the label raised.
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  )
}
