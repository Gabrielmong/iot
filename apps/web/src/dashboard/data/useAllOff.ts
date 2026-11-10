import { useCallback } from 'react'
import { devicesToTurnOff } from '../lib/devicesToTurnOff'
import type { Device, StatePatch } from '../types'

type SetState = (device: Device, patch: StatePatch) => Promise<void>

/**
 * Returns `allOff(devices)`: sends `on: false` to every on, toggleable device at once. Each command
 * succeeds or fails on its own; failures surface through `setState`'s error reporting.
 */
export function useAllOff(setState: SetState) {
  return useCallback(
    (devices: readonly Device[]) => Promise.all(devicesToTurnOff(devices).map((d) => setState(d, { on: false }))),
    [setState],
  )
}
