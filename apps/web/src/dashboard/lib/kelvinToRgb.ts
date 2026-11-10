import type { Rgb } from '../types'

export const MIN_KELVIN = 2700
export const MAX_KELVIN = 6500
/** Shown when a light reports no white temperature. */
export const DEFAULT_KELVIN = 4000

const WARM: Rgb = { r: 255, g: 169, b: 87 }
const COOL: Rgb = { r: 235, g: 240, b: 255 }

/** Approximate on-screen tint for a white temperature (linear between warm and cool). */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.min(1, Math.max(0, (kelvin - MIN_KELVIN) / (MAX_KELVIN - MIN_KELVIN)))
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return { r: mix(WARM.r, COOL.r), g: mix(WARM.g, COOL.g), b: mix(WARM.b, COOL.b) }
}
