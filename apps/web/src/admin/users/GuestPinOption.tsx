import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'

type Props = { checked: boolean; onChange: (checked: boolean) => void }

/** Guests may skip the PIN: they tap their profile to sign in. */
export function GuestPinOption({ checked, onChange }: Props) {
  return <FormControlLabel label="No PIN" control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />} />
}
