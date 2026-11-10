import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  disabled?: boolean
  onCommit: (value: number) => void
}

/** A labelled slider that follows the finger locally and only reports the value on release. */
export function CommitSlider({ label, value, min, max, step = 1, formatValue, disabled = false, onCommit }: Props) {
  const [draft, setDraft] = useState<number | null>(null)
  return (
    <div>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Slider
        aria-label={label}
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        valueLabelDisplay="auto"
        disabled={disabled}
        valueLabelFormat={formatValue}
        onChange={(_, v) => setDraft(v as number)}
        onChangeCommitted={(_, v) => {
          setDraft(null)
          onCommit(v as number)
        }}
      />
    </div>
  )
}
