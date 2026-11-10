import { CameraRequestError } from './cameraRequest'

/** The server's 503 code when the Tuya cloud gives no stream for a camera. */
export const CLOUD_STREAM_UNAVAILABLE = 'CLOUD_STREAM_UNAVAILABLE'

export const CLOUD_UNAVAILABLE_MESSAGE = 'Cloud stream not available for this camera'

/** Whether a camera request failed because the Tuya cloud refused the stream. */
export function isCloudStreamRefusal(error: unknown): boolean {
  return error instanceof CameraRequestError && error.status === 503 && error.code === CLOUD_STREAM_UNAVAILABLE
}
