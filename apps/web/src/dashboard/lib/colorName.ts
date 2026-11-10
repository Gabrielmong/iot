import type { Rgb } from '../types'

/** The fixed palette used to name a light's color. */
export const NAMED_COLORS: readonly { name: string; rgb: Rgb }[] = [
  { name: 'Red', rgb: { r: 255, g: 0, b: 0 } },
  { name: 'Orange', rgb: { r: 255, g: 128, b: 0 } },
  { name: 'Yellow', rgb: { r: 255, g: 230, b: 0 } },
  { name: 'Lime', rgb: { r: 160, g: 255, b: 0 } },
  { name: 'Green', rgb: { r: 0, g: 200, b: 0 } },
  { name: 'Teal', rgb: { r: 0, g: 160, b: 140 } },
  { name: 'Cyan', rgb: { r: 0, g: 230, b: 255 } },
  { name: 'Blue', rgb: { r: 0, g: 70, b: 255 } },
  { name: 'Purple', rgb: { r: 140, g: 70, b: 255 } },
  { name: 'Magenta', rgb: { r: 255, g: 0, b: 220 } },
  { name: 'Pink', rgb: { r: 255, g: 120, b: 180 } },
  { name: 'White', rgb: { r: 255, g: 255, b: 255 } },
]

const distance = (a: Rgb, b: Rgb) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2

/** Name of the palette color nearest to `rgb` (squared RGB distance). */
export function colorName(rgb: Rgb): string {
  let best = NAMED_COLORS[0]
  for (const c of NAMED_COLORS) if (distance(rgb, c.rgb) < distance(rgb, best.rgb)) best = c
  return best.name
}

/** Name for a white-mode color temperature. */
export function whiteTempName(kelvin: number): string {
  if (kelvin <= 3500) return 'Warm'
  if (kelvin <= 5000) return 'Neutral'
  return 'Cool'
}
