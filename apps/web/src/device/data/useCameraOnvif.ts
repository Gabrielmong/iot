import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { CLEAR_CAMERA_ONVIF, SET_CAMERA_ONVIF } from './documents'

/**
 * `switchToLocal(username, password, confirmAddress)`: the server checks the address the admin
 * confirmed, finds and verifies the camera's ONVIF stream there, then streams it locally. `switchToCloud()`: back to the Tuya cloud. Both reject on failure.
 */
export function useCameraOnvif(deviceId: string) {
  const [set] = useMutation(SET_CAMERA_ONVIF)
  const [clear] = useMutation(CLEAR_CAMERA_ONVIF)
  const switchToLocal = useCallback(
    async (username: string, password: string, confirmAddress: string) =>
      void (await set({ variables: { deviceId, username, password, confirmAddress } })),
    [set, deviceId],
  )
  const switchToCloud = useCallback(async () => void (await clear({ variables: { deviceId } })), [clear, deviceId])
  return { switchToLocal, switchToCloud }
}
