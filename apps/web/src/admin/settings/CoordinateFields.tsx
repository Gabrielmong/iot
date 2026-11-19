import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

type Props = { lat: string; lng: string; error: string | null; onChange: (lat: string, lng: string) => void }

/** Latitude and longitude typed in by hand (e.g. copied from a maps app). */
export function CoordinateFields({ lat, lng, error, onChange }: Props) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField label="Latitude" type="number" value={lat} onChange={(e) => onChange(e.target.value, lng)} error={error !== null && error.startsWith('Latitude')} slotProps={{ htmlInput: { step: 'any' } }} />
      <TextField label="Longitude" type="number" value={lng} onChange={(e) => onChange(lat, e.target.value)} error={error !== null && error.startsWith('Longitude')} slotProps={{ htmlInput: { step: 'any' } }} />
    </Stack>
  )
}
