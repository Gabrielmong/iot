import { type RefObject, useEffect } from 'react'
import { getToken } from '../../auth/session'
import { mseSocketUrl, type StreamQuality } from '../lib/cameraPaths'
import { mseAuthMessage, mseCodecs, mseRequest, parseMseMessage } from '../lib/mseProtocol'
import type { StreamEvent } from '../lib/playerMachine'
import { endSessionFor } from '../lib/sessionGuard'
import { CLOSE_SESSION, closeEvent } from '../lib/streamFailure'
import { createSegmentAppender, type SegmentAppender } from './segmentAppender'

type Options = {
  deviceId: string
  videoRef: RefObject<HTMLVideoElement | null>
  /** Run a session now. */
  active: boolean
  /** A new value starts a fresh session. */
  attempt: number
  /** Must be stable (e.g. a reducer's dispatch). */
  onEvent: (e: StreamEvent) => void
  /** A Tuya cloud camera: a 4503 close means the cloud refused the stream. */
  cloud?: boolean
  /** Which stream to request (default: main). */
  quality?: StreamQuality
}

/** While `active`, plays the camera over MSE (go2rtc's protocol behind our WebSocket), reporting playing / dropped / failed. */
export function useMsePlayer({ deviceId, videoRef, active, attempt, onEvent, cloud = false, quality = 'main' }: Options): void {
  useEffect(() => {
    const video = videoRef.current
    if (!active || !video) return
    return startMse(deviceId, video, onEvent, cloud, quality)
  }, [deviceId, videoRef, active, attempt, onEvent, cloud, quality])
}

/**
 * One MSE session: once the MediaSource opens, connect, authenticate, ask go2rtc for MSE with the
 * codecs this browser plays, create the SourceBuffer from its reply, then append binary segments.
 * Reports at most one terminal event; returns its teardown.
 */
function startMse(deviceId: string, video: HTMLVideoElement, emit: (e: StreamEvent) => void, cloud: boolean, quality: StreamQuality): () => void {
  let done = false
  let playing = false
  const finish = (e: StreamEvent) => {
    if (done) return
    done = true
    emit(e)
  }

  if (typeof MediaSource === 'undefined' || typeof WebSocket === 'undefined') {
    finish({ type: 'failed', failure: 'unavailable' })
    return () => undefined
  }

  const source = new MediaSource()
  const src = URL.createObjectURL(source)
  video.src = src
  let ws: WebSocket | null = null
  let appender: SegmentAppender | null = null
  const token = getToken()

  const onText = (text: string) => {
    const msg = parseMseMessage(text)
    if (msg?.type === 'error') return finish({ type: 'failed', failure: 'unavailable' })
    if (msg?.type !== 'mse' || appender) return
    try {
      appender = createSegmentAppender(source.addSourceBuffer(msg.value), video)
    } catch {
      return finish({ type: 'failed', failure: 'unavailable' }) // a codec this browser cannot play
    }
    playing = true
    if (!done) emit({ type: 'playing' })
  }

  source.addEventListener(
    'sourceopen',
    () => {
      if (done) return
      const socket = new WebSocket(mseSocketUrl(deviceId, window.location, quality))
      ws = socket
      socket.binaryType = 'arraybuffer'
      socket.onopen = () => {
        socket.send(mseAuthMessage(token ?? ''))
        socket.send(mseRequest(mseCodecs((type) => MediaSource.isTypeSupported(type))))
      }
      socket.onmessage = (e: MessageEvent) => {
        if (typeof e.data === 'string') onText(e.data)
        else if (e.data instanceof ArrayBuffer) appender?.append(e.data)
      }
      socket.onclose = (e: CloseEvent) => {
        if (done) return
        if (e.code === CLOSE_SESSION) endSessionFor(token)
        finish(closeEvent(e.code, playing, cloud))
      }
    },
    { once: true },
  )

  return () => {
    done = true
    ws?.close()
    if (source.readyState === 'open') {
      try {
        source.endOfStream()
      } catch {
        // already ending
      }
    }
    video.removeAttribute('src')
    URL.revokeObjectURL(src)
  }
}
