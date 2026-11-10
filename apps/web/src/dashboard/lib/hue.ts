import type { Rgb } from '../types'

/** Full-saturation, full-value color for a hue in degrees (0–360). */
export function hueToRgb(hue: number): Rgb {
  const h = (((hue % 360) + 360) % 360) / 60
  const x = Math.round(255 * (1 - Math.abs((h % 2) - 1)))
  const sector: [number, number, number][] = [
    [255, x, 0], [x, 255, 0], [0, 255, x], [0, x, 255], [x, 0, 255], [255, 0, x],
  ]
  const [r, g, b] = sector[Math.floor(h)]
  return { r, g, b }
}

/** Hue in whole degrees (0–359) of an RGB color; 0 for greys. */
export function rgbToHue({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return Math.round((h * 60 + 360) % 360)
}
