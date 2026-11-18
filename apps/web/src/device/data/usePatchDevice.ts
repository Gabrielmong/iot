import { useCallback, useState } from 'react'
import { useSetDeviceState } from '../../dashboard/data/useSetDeviceState'
import type { Device, StatePatch } from '../../dashboard/types'

/**
 * `onPatch(patch)` sends a change to this device optimistically (the page updates at once and
 * reverts on failure); `error` is the snackbar text of the last failed command.
 */
export function usePatchDevice(device: Device) {
  const [error, setError] = useState<string | null>(null)
  const setState = useSetDeviceState(setError)
  const onPatch = useCallback((patch: StatePatch) => setState(device, patch), [setState, device])
  const clearError = useCallback(() => setError(null), [])
  return { onPatch, error, clearError }
}
