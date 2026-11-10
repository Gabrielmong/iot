import { type StreamQuality, webrtcPath } from './cameraPaths'
import { cameraFetch } from './cameraRequest'

/** How long to let ICE gathering finish before sending the offer anyway (LAN host candidates are quick). */
export const ICE_GATHER_MAX_MS = 1_000

/** Resolves when ICE gathering completes, or after `maxMs`, whichever is first. */
export function iceGathered(pc: RTCPeerConnection, maxMs = ICE_GATHER_MAX_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    const timer = setTimeout(done, maxMs)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

/** Posts an SDP offer for the camera and returns the SDP answer. */
export async function postOffer(deviceId: string, sdp: string, signal: AbortSignal, quality: StreamQuality = 'main'): Promise<string> {
  const res = await cameraFetch(webrtcPath(deviceId, quality), {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: sdp,
    signal,
  })
  return res.text()
}

/** Offer (non-trickle: candidates gathered first), post it, apply the answer. */
export async function negotiate(pc: RTCPeerConnection, deviceId: string, signal: AbortSignal, quality: StreamQuality = 'main'): Promise<void> {
  await pc.setLocalDescription(await pc.createOffer())
  await iceGathered(pc)
  const answer = await postOffer(deviceId, pc.localDescription?.sdp ?? '', signal, quality)
  await pc.setRemoteDescription({ type: 'answer', sdp: answer })
}
