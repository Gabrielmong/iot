import { CameraRequestError } from './cameraRequest'
import { isCloudStreamRefusal } from './cloudStream'
import type { StreamEvent, StreamFailure } from './playerMachine'

/** Camera socket close codes (the server's `close-codes.ts`). */
export const CLOSE_SESSION = 4401
const CLOSE_NO_ACCESS = 4404
const CLOSE_UNAVAILABLE = 4503

/**
 * A signalling error: 401 ends the session, 404 means unavailable, the Tuya cloud's 503 means the
 * cloud refused; anything else (another 503, e.g. go2rtc failing WebRTC for this source; network)
 * falls back to MSE, which may still play it.
 */
export function failureOf(error: unknown): StreamFailure {
  if (isCloudStreamRefusal(error)) return 'cloud'
  if (!(error instanceof CameraRequestError)) return 'fallback'
  if (error.status === 401) return 'session'
  if (error.status === 404) return 'unavailable'
  return 'fallback'
}

/**
 * What an MSE socket closing with `code` means, given whether the stream had started. A close carries
 * no `{code}`, so for a cloud camera 4503 is taken as the cloud refusing the stream.
 */
export function closeEvent(code: number, playing: boolean, cloud = false): StreamEvent {
  if (code === CLOSE_SESSION) return { type: 'failed', failure: 'session' }
  if (code === CLOSE_UNAVAILABLE && cloud) return { type: 'failed', failure: 'cloud' }
  if (code === CLOSE_NO_ACCESS || code === CLOSE_UNAVAILABLE) return { type: 'failed', failure: 'unavailable' }
  return playing ? { type: 'dropped' } : { type: 'failed', failure: 'fallback' }
}
