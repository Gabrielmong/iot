import TextField from '@mui/material/TextField'

type Props = { value: string; error: string | null; onChange: (code: string) => void }

/** The code the TV shows (Android TV: 6 hex characters), upper-cased as typed. */
export function PairingCodeField({ value, error, onChange }: Props) {
  return (
    <TextField
      label="Code on the TV"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, ''))}
      error={error !== null}
      helperText={error ?? 'Type the code shown on the TV screen.'}
      autoComplete="off"
      autoFocus
      fullWidth
      slotProps={{ htmlInput: { maxLength: 8, style: { letterSpacing: '0.3em', fontFamily: 'monospace' } } }}
    />
  )
}
