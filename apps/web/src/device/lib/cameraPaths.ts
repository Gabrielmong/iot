/** `sub`: the camera's light sub-stream (grid tiles); the server serves the main stream when there is none. */
export type StreamQuality = 'main' | 'sub'

const base = (deviceId: string) => `/api/cameras/${encodeURIComponent(deviceId)}`
const query = (quality: StreamQuality) => (quality === 'sub' ? '?quality=sub' : '')

/** `GET`: the camera's latest frame (JPEG, age in `X-Frame-Age`). */
export const thumbnailPath = (deviceId: string): string => `${base(deviceId)}/thumbnail.jpg`

/** `POST` an `application/sdp` offer; the answer comes back as `application/sdp`. */
export const webrtcPath = (deviceId: string, quality: StreamQuality = 'main'): string => `${base(deviceId)}/webrtc${query(quality)}`

/** The camera's MSE WebSocket, same origin as the page. */
export function mseSocketUrl(deviceId: string, loc: Pick<Location, 'protocol' | 'host'> = window.location, quality: StreamQuality = 'main'): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${base(deviceId)}/mse${query(quality)}`
}
