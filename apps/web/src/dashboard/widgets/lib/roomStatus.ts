import { devicesToTurnOff } from '../../lib/devicesToTurnOff'
import { devicesInTab } from '../../lib/roomTabs'
import type { Device } from '../../types'
import { offlineDevices } from './offlineDevices'

/** A room at a glance: "2 on" (or "All off"), and "1 offline" when any device there isn't responding. */
export function roomStatus(devices: readonly Device[], roomId: string): { on: string; offline: string | null } {
  const inRoom = devicesInTab(devices, roomId)
  const on = devicesToTurnOff(inRoom).length
  const offline = offlineDevices(inRoom).length
  return { on: on === 0 ? 'All off' : `${on} on`, offline: offline === 0 ? null : `${offline} offline` }
}
