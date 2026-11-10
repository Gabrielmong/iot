import { useMutation, useQuery } from '@apollo/client/react'
import { useCallback, useEffect, useState } from 'react'
import type { CameraControlsFieldsFragment, CameraSettingsInput, PanDirection } from '../../gql/graphql'
import { cameraControlErrorMessage } from '../lib/cameraControlErrorMessage'
import { CAMERA_CONTROLS, GOTO_CAMERA_PRESET, MOVE_CAMERA, SAVE_CAMERA_PRESET, SET_CAMERA_SETTINGS, STOP_CAMERA } from './documents'

export type CameraControls = CameraControlsFieldsFragment

/**
 * A camera's controls and current values (read fresh each time, never polled), and its commands.
 * Commands never throw: a failure sets `error` (cleared by the next success). Settings and preset
 * saves return the camera's new state, which replaces `controls`.
 */
export function useCameraControls(deviceId: string) {
  const { data, loading } = useQuery(CAMERA_CONTROLS, { variables: { deviceId }, fetchPolicy: 'network-only' })
  const [latest, setLatest] = useState<CameraControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moveM] = useMutation(MOVE_CAMERA)
  const [stopM] = useMutation(STOP_CAMERA)
  const [gotoM] = useMutation(GOTO_CAMERA_PRESET)
  const [saveM] = useMutation(SAVE_CAMERA_PRESET)
  const [setM] = useMutation(SET_CAMERA_SETTINGS)

  useEffect(() => setLatest(null), [data])

  const attempt = useCallback(async (run: () => Promise<CameraControls | null | undefined | void>) => {
    try {
      const next = await run()
      if (next) setLatest(next)
      setError(null)
    } catch (err) {
      setError(cameraControlErrorMessage(err))
    }
  }, [])

  const move = useCallback((direction: PanDirection) => attempt(async () => void (await moveM({ variables: { deviceId, direction } }))), [attempt, moveM, deviceId])
  const stop = useCallback(() => attempt(async () => void (await stopM({ variables: { deviceId } }))), [attempt, stopM, deviceId])
  const gotoPreset = useCallback((slot: number) => attempt(async () => void (await gotoM({ variables: { deviceId, slot } }))), [attempt, gotoM, deviceId])
  const savePreset = useCallback(
    (slot: number) => attempt(async () => (await saveM({ variables: { deviceId, slot } })).data?.saveCameraPreset),
    [attempt, saveM, deviceId],
  )
  const setSettings = useCallback(
    (settings: CameraSettingsInput) => attempt(async () => (await setM({ variables: { deviceId, settings } })).data?.setCameraSettings),
    [attempt, setM, deviceId],
  )

  return { controls: latest ?? data?.cameraControls ?? null, loading, error, move, stop, gotoPreset, savePreset, setSettings }
}
