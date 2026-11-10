import TextField from '@mui/material/TextField'
import { ROUTINE_LIMITS } from '../lib/draftErrors'

type Props = { minutes: number; onChange: (minutes: number) => void }

/** A pause between steps, in whole minutes (1–720). */
export function WaitStepCard({ minutes, onChange }: Props) {
  return (
    <TextField
      label="Minutes"
      type="number"
      size="small"
      value={Number.isNaN(minutes) ? '' : minutes}
      onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      slotProps={{ htmlInput: { min: ROUTINE_LIMITS.minWait, max: ROUTINE_LIMITS.maxWait, step: 1 } }}
      sx={{ width: 140 }}
    />
  )
}
