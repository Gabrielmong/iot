import { isSwitchable, lightCapabilities } from '../../dashboard/lib/capabilities'
import { visibleTiles } from '../../dashboard/lib/visibleTiles'
import type { Device } from '../../dashboard/types'
import type { DraftAction } from './draft'

const isRoutineDevice = (d: Device) => isSwitchable(d) || d.kind === 'TV' || d.kind === 'COMPUTER'

/** Devices a routine step can use: lights, switches, plugs, TVs and computers (not a power strip whose outlets show). */
export const usableDevices = (devices: readonly Device[]): Device[] => visibleTiles(devices).filter(isRoutineDevice)

/** The action without settings the device doesn't support (mirrors the server's fitAction). */
export function fitDraftAction(action: DraftAction, device: Device): DraftAction {
  if (lightCapabilities(device).brightness) return action
  const on = device.kind === 'COMPUTER' ? true : action.on
  return { ...action, on, brightness: null, color: null, colorTempK: null }
}
