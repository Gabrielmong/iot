import type { Device } from '../types'
import { canToggle } from './capabilities'
import { isDeviceOn } from './isDeviceOn'

/** The devices "All off" switches off: toggleable right now and currently on. */
export function devicesToTurnOff(devices: readonly Device[]): Device[] {
  return devices.filter((d) => canToggle(d) && isDeviceOn(d.state))
}
