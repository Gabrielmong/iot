import { type RefObject, useEffect } from 'react'
import type { StreamEvent } from '../lib/playerMachine'
import { failureOf } from '../lib/streamFailure'
import { negotiate } from '../lib/webrtcSignalling'
import type { StreamQuality } from '../lib/cameraPaths'

/** Not connected within this ⇒ fall back to MSE. */
export const WEBRTC_CONNECT_TIMEOUT_MS = 10_000

type Options = {
  deviceId: string
  /** Which stream to request (default: main). */
  quality?: StreamQuality
  videoRef: RefObject<HTMLVideoElement | null>
  /** Run a session now. */
  active: boolean
  /** A new value starts a fresh session. */
  attempt: number
  /** Must be stable (e.g. a reducer's dispatch). */
  onEvent: (e: StreamEvent) => void
}

/** While `active`, plays the camera over WebRTC into the video element, reporting playing / dropped / failed. */
export function useWebRtcPlayer({ deviceId, videoRef, active, attempt, onEvent, quality = 'main' }: Options): void {
  useEffect(() => {
    const video = videoRef.current
    if (!active || !video) return
    return startWebRtc(deviceId, video, onEvent, quality)
  }, [deviceId, videoRef, active, attempt, onEvent, quality])
}

/** One WebRTC session (recvonly video + audio). Reports at most one terminal event; returns its teardown. */
function startWebRtc(deviceId: string, video: HTMLVideoElement, emit: (e: StreamEvent) => void, quality: StreamQuality): () => void {
  let done = false
  let connected = false
  const finish = (e: StreamEvent) => {
    if (done) return
    done = true
    emit(e)
  }

  let pc: RTCPeerConnection
  try {
    pc = new RTCPeerConnection()
  } catch {
    finish({ type: 'failed', failure: 'fallback' }) // no WebRTC in this browser
    return () => undefined
  }

  const tracks = (['video', 'audio'] as const).map((kind) => pc.addTransceiver(kind, { direction: 'recvonly' }).receiver.track)
  video.srcObject = new MediaStream(tracks)

  const timer = setTimeout(() => finish({ type: 'failed', failure: 'fallback' }), WEBRTC_CONNECT_TIMEOUT_MS)
  pc.addEventListener('connectionstatechange', () => {
    const state = pc.connectionState
    if (state === 'connected' && !connected) {
      connected = true
      clearTimeout(timer)
      if (!done) emit({ type: 'playing' })
    } else if (state === 'failed' || state === 'disconnected') {
      finish(connected ? { type: 'dropped' } : { type: 'failed', failure: 'fallback' })
    }
  })

  const controller = new AbortController()
  negotiate(pc, deviceId, controller.signal, quality).catch((error: unknown) => finish({ type: 'failed', failure: failureOf(error) }))

  return () => {
    done = true
    clearTimeout(timer)
    controller.abort()
    pc.close()
    video.srcObject = null
  }
}
