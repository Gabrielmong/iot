import { type RefObject, useEffect, useReducer } from 'react'
import { initialPlayerState, isLive, type PlayerState, playerReducer } from '../lib/playerMachine'
import { useDocumentVisible } from './useDocumentVisible'
import { useMsePlayer } from './useMsePlayer'
import { useWebRtcPlayer } from './useWebRtcPlayer'
import type { StreamQuality } from '../lib/cameraPaths'

/** Wait this long after a playing stream drops before the one retry. */
export const RETRY_DELAY_MS = 2_000

/**
 * The camera's live stream into `videoRef`: WebRTC, falling back to MSE, one retry after a drop.
 * Nothing runs while the page is hidden; becoming visible again starts over. `cloud`: the camera
 * streams via the Tuya cloud (its MSE "unavailable" close then means the cloud refused). `quality`:
 * `sub` asks for the light sub-stream (grid tiles).
 */
export function useLiveStream(
  deviceId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  cloud = false,
  quality: StreamQuality = 'main',
): PlayerState {
  const visible = useDocumentVisible()
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState)

  useEffect(() => dispatch({ type: visible ? 'resume' : 'pause' }), [visible])

  useEffect(() => {
    if (state.phase !== 'retrying') return
    const timer = setTimeout(() => dispatch({ type: 'retry' }), RETRY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state.phase])

  // `visible &&` tears a session down in the very render the page is hidden, before `pause` lands.
  const session = { deviceId, videoRef, attempt: state.attempt, onEvent: dispatch, quality }
  useWebRtcPlayer({ ...session, active: visible && isLive(state, 'webrtc') })
  useMsePlayer({ ...session, cloud, active: visible && isLive(state, 'mse') })
  return state
}
