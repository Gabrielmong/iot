import { useCallback } from 'react'
import { isComputer } from '../lib/capabilities'
import { isDeviceOn } from '../lib/isDeviceOn'
import type { Device, StatePatch } from '../types'

type SetState = (device: Device, patch: StatePatch) => Promise<void>

/** Returns `toggle(device)`: flips `on` through `setState`; a computer is only ever woken. */
export function useToggleDevice(setState: SetState) {
  return useCallback((device: Device) => setState(device, { on: isComputer(device) || !isDeviceOn(device.state) }), [setState])
}
