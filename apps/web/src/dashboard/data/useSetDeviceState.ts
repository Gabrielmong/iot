import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { applyPatch } from '../lib/applyPatch'
import { commandErrorMessage } from '../lib/commandErrorMessage'
import type { Device, StatePatch } from '../types'
import { SET_DEVICE_STATE } from './documents'

/**
 * Returns `setState(device, patch)`: applies the patch optimistically (Apollo drops the optimistic
 * layer on error, reverting the tile) and reports failures through `onError` as snackbar text. Resolves to whether it succeeded.
 */
export function useSetDeviceState(onError: (message: string) => void) {
  const [mutate] = useMutation(SET_DEVICE_STATE)
  return useCallback(
    async (device: Device, patch: StatePatch) => {
      try {
        await mutate({
          variables: { id: device.id, patch },
          optimisticResponse: { setDeviceState: applyPatch(device, patch) },
        })
        return true
      } catch (error) {
        onError(commandErrorMessage(error, device.name))
        return false
      }
    },
    [mutate, onError],
  )
}
