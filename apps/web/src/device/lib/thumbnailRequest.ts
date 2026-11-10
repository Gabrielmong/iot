import { thumbnailPath } from './cameraPaths'
import { cameraFetch } from './cameraRequest'
import { parseFrameAge } from './thumbnailAge'

export type Thumbnail = { blob: Blob; ageSeconds: number }

/** The camera's latest frame. A background request: polling never slides the session. */
export async function fetchThumbnail(deviceId: string, signal: AbortSignal): Promise<Thumbnail> {
  const res = await cameraFetch(thumbnailPath(deviceId), {
    headers: { 'x-home-background': '1' },
    cache: 'no-store',
    signal,
  })
  return { blob: await res.blob(), ageSeconds: parseFrameAge(res.headers.get('X-Frame-Age')) }
}
