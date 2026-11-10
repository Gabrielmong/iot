import { useEffect, useRef, useState } from 'react'
import { isCloudStreamRefusal } from '../lib/cloudStream'
import { isThumbnailStale } from '../lib/thumbnailAge'
import { fetchThumbnail } from '../lib/thumbnailRequest'
import { useDocumentVisible } from './useDocumentVisible'

export const THUMBNAIL_POLL_MS = 10_000

/** `cloudUnavailable`: the last request failed because the Tuya cloud refused the stream. */
export type ThumbnailView = { src: string | null; ageSeconds: number | null; stale: boolean; cloudUnavailable: boolean }

type Shot = { src: string | null; ageSeconds: number | null; failed: boolean; cloudUnavailable: boolean }
const EMPTY: Shot = { src: null, ageSeconds: null, failed: false, cloudUnavailable: false }

/**
 * Polls the camera's thumbnail every 10 s while the page is visible. Each poll aborts one still in
 * flight (which then counts as failed), so a hung request turns the image stale rather than leaving
 * an old frame up. The blob URL is revoked when replaced, on hide and on unmount; a stale frame is
 * never returned.
 */
export function useThumbnail(deviceId: string): ThumbnailView {
  const visible = useDocumentVisible()
  const [shot, setShot] = useState<Shot>(EMPTY)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!visible) return
    const effect = new AbortController() // aborted on cleanup: late results are dropped
    const inFlight: { current: AbortController | null } = { current: null }

    const show = (src: string | null, ageSeconds: number | null, failed: boolean, cloudUnavailable = false) => {
      const old = urlRef.current
      urlRef.current = src
      if (old && old !== src) URL.revokeObjectURL(old)
      setShot({ src, ageSeconds, failed, cloudUnavailable })
    }

    const poll = () => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      fetchThumbnail(deviceId, controller.signal).then(
        ({ blob, ageSeconds }) => {
          if (!effect.signal.aborted) show(URL.createObjectURL(blob), ageSeconds, false)
        },
        (error: unknown) => {
          if (!effect.signal.aborted) show(null, null, true, isCloudStreamRefusal(error))
        },
      )
    }

    poll()
    const timer = setInterval(poll, THUMBNAIL_POLL_MS)
    return () => {
      effect.abort()
      clearInterval(timer)
      inFlight.current?.abort()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
      setShot(EMPTY)
    }
  }, [deviceId, visible])

  const stale = isThumbnailStale(shot.ageSeconds, shot.failed)
  return { src: stale ? null : shot.src, ageSeconds: shot.ageSeconds, stale, cloudUnavailable: shot.cloudUnavailable }
}
