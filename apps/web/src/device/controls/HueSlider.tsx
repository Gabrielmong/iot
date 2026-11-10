import { hueToRgb, rgbToHue } from '../../dashboard/lib/hue'
import type { Rgb } from '../../dashboard/types'
import { CommitSlider } from './CommitSlider'

/** Free color choice as a hue (full saturation), sent on release. */
type Props = { color: Rgb | null; disabled?: boolean; onCommit: (color: Rgb) => void }

export function HueSlider({ color, disabled, onCommit }: Props) {
  return (
    <CommitSlider
      label="Hue"
      value={color ? rgbToHue(color) : 0}
      min={0}
      max={359}
      formatValue={(v) => `${v}°`}
      disabled={disabled}
      onCommit={(hue) => onCommit(hueToRgb(hue))}
    />
  )
}
