import type { Device, Rgb } from '../types'
import { isDeviceOn } from './isDeviceOn'
import { kelvinToRgb } from './kelvinToRgb'

export const DOT_OFF = 'rgb(128, 128, 128)'

const css = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`

/** CSS color for a light tile's dot (grey when off or offline); null for non-lights. */
export function dotColor(d: Device): string | null {
  const light = d.state.light
  if (!light) return null
  if (!isDeviceOn(d.state) || !d.state.online) return DOT_OFF
  if (light.mode === 'white' && light.colorTempK != null) return css(kelvinToRgb(light.colorTempK))
  return light.color ? css(light.color) : DOT_OFF
}
