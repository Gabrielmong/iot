/** Keep at most this much played media in the buffer… */
const MAX_BACK_BUFFER_S = 30
/** …trimming back to this much. */
const KEEP_BACK_BUFFER_S = 10
/** Further behind live than this ⇒ jump to the live edge. */
const MAX_LAG_S = 3

export type SegmentAppender = { append(segment: ArrayBuffer): void }

/**
 * Feeds fMP4 segments into a SourceBuffer one at a time (it accepts one append per `updateend`),
 * keeps playback near the live edge and trims played media so the buffer does not grow forever.
 */
export function createSegmentAppender(sb: SourceBuffer, video: HTMLVideoElement): SegmentAppender {
  const queue: ArrayBuffer[] = []

  const pump = () => {
    if (sb.updating || queue.length === 0) return
    try {
      sb.appendBuffer(queue.shift()!)
    } catch {
      queue.length = 0 // buffer full or source closed: drop what is pending, live video moves on
    }
  }

  const keepLive = () => {
    const { buffered } = sb
    if (buffered.length === 0) return
    const end = buffered.end(buffered.length - 1)
    if (end - video.currentTime > MAX_LAG_S) video.currentTime = end - 0.5
    const start = buffered.start(0)
    if (video.currentTime - start > MAX_BACK_BUFFER_S && !sb.updating) sb.remove(start, video.currentTime - KEEP_BACK_BUFFER_S)
  }

  sb.addEventListener('updateend', () => {
    keepLive()
    pump()
  })

  return {
    append(segment) {
      queue.push(segment)
      pump()
    },
  }
}
