import { CommitSlider } from './CommitSlider'

/** Brightness 1–100 %, sent on release. */
type Props = { value: number; disabled?: boolean; onCommit: (brightness: number) => void }

export function BrightnessSlider({ value, disabled, onCommit }: Props) {
  return (
    <CommitSlider label="Brightness" value={value} min={1} max={100} formatValue={(v) => `${v}%`} disabled={disabled} onCommit={onCommit} />
  )
}
