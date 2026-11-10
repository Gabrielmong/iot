import { MAX_KELVIN, MIN_KELVIN } from '../../dashboard/lib/kelvinToRgb'
import { CommitSlider } from './CommitSlider'

/** White color temperature 2700–6500 K, sent on release. */
type Props = { value: number; disabled?: boolean; onCommit: (kelvin: number) => void }

export function WhiteTempSlider({ value, disabled, onCommit }: Props) {
  return (
    <CommitSlider
      label="White temperature"
      value={value}
      min={MIN_KELVIN}
      max={MAX_KELVIN}
      step={100}
      formatValue={(v) => `${v} K`}
      disabled={disabled}
      onCommit={onCommit}
    />
  )
}
