import type { Device } from '../types'
import { canToggle, isComputer } from './capabilities'
import { isDeviceOn } from './isDeviceOn'

export type TileOnStyle = 'on' | 'off'

const POWER_KINDS = new Set<Device['kind']>(['SWITCH', 'PLUG', 'TV', 'COMPUTER'])

/**
 * How a switch, plug, TV or computer tile shows its state; null for kinds that don't use the power look
 * (lights, cameras) and for a computer whose state is unknown (no IP to probe). Offline or not-ready
 * devices are never "on" so they keep the disabled look.
 */
export function tileOnStyle(device: Device): TileOnStyle | null {
  if (!POWER_KINDS.has(device.kind)) return null
  if (isComputer(device) && device.state.on == null) return null
  return canToggle(device) && isDeviceOn(device.state) ? 'on' : 'off'
}
