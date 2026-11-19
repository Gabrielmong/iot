import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useState } from 'react'

type Props = { number: number; offsetMinutes: number; onChange: (offsetMinutes: number) => void }

const MAX_MINUTES = 180

/**
 * How long before or after sunrise/sunset: 0–180 minutes and Before / After. The direction is kept
 * here too, so picking Before at 0 minutes still holds once minutes are typed.
 */
export function SunScheduleFields({ number, offsetMinutes, onChange }: Props) {
  const [before, setBefore] = useState(offsetMinutes < 0)
  const minutes = Math.abs(offsetMinutes)
  const send = (m: number, isBefore: boolean) => onChange(isBefore ? -m : m)
  return (
    <>
      <TextField
        type="number"
        size="small"
        label="Minutes"
        value={minutes}
        onChange={(e) => {
          const m = Math.min(MAX_MINUTES, Math.max(0, Math.round(Number(e.target.value) || 0)))
          send(m, before)
        }}
        slotProps={{ htmlInput: { min: 0, max: MAX_MINUTES } }}
        sx={{ width: 100 }}
      />
      <ToggleButtonGroup
        size="small"
        exclusive
        aria-label={`Before or after for time ${number}`}
        value={before ? 'before' : 'after'}
        onChange={(_, next: 'before' | 'after' | null) => {
          if (!next) return
          setBefore(next === 'before')
          send(minutes, next === 'before')
        }}
      >
        <ToggleButton value="before">Before</ToggleButton>
        <ToggleButton value="after">After</ToggleButton>
      </ToggleButtonGroup>
    </>
  )
}
