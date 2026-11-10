import type { Device } from '../types'
import { canToggle } from './capabilities'
import { dotColor } from './dotColor'
import { isDeviceOn } from './isDeviceOn'
import { tileOnStyle } from './tileOnStyle'

export const ON_GLOW = 'rgb(47, 211, 138)'

export type TileGlow = { color: string; strength: number }

/**
 * The ambient light a tile casts: a lit light glows in its own colour, brighter with brightness;
 * an on plug, switch, TV or computer glows green. Null when nothing is lit (off, offline, cameras).
 */
export function tileGlow(device: Device): TileGlow | null {
  if (!canToggle(device) || !isDeviceOn(device.state)) return null
  const light = device.state.light
  if (light) {
    const color = dotColor(device)
    return color ? { color, strength: 0.35 + 0.65 * (light.brightness / 100) } : null
  }
  if (tileOnStyle(device) === 'on') return { color: ON_GLOW, strength: 0.55 }
  return null
}
