import { isDeviceOn } from '../../dashboard/lib/isDeviceOn'
import { DEFAULT_KELVIN, kelvinToRgb } from '../../dashboard/lib/kelvinToRgb'
import type { Rgb } from '../../dashboard/types'

type PreviewLight = {
  on?: boolean
  brightness: number
  mode: string
  color: Rgb | null
  colorTempK?: number | null
}

/** The part of a device's state the light preview draws from. */
export type PreviewState = { on?: boolean | null; light?: PreviewLight | null }

export type PreviewColor = { css: string; glow: number }

const OFF: PreviewColor = { css: '#3a3f4b', glow: 0 }

function scaled({ r, g, b }: Rgb, brightness: number): PreviewColor {
  const glow = Math.min(1, Math.max(0, brightness / 100))
  const c = (v: number) => Math.round(v * glow)
  return { css: `rgb(${c(r)}, ${c(g)}, ${c(b)})`, glow }
}

/**
 * The colour a light preview glows with: the colour (or white-temperature tint) dimmed by brightness,
 * and `glow` 0..1 for how strongly it shines. Off is a dark grey with no glow.
 */
export function previewColor(state: PreviewState): PreviewColor {
  if (!isDeviceOn(state)) return OFF
  const light = state.light
  if (!light) return scaled(kelvinToRgb(DEFAULT_KELVIN), 100)
  const base = light.mode === 'color' && light.color ? light.color : kelvinToRgb(light.colorTempK ?? DEFAULT_KELVIN)
  return scaled(base, light.brightness)
}
