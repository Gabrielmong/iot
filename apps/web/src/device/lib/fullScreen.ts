type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

/**
 * Toggles full screen on the player frame (so the controls come along). iPhone Safari has no
 * element full screen: there the video itself goes full screen.
 */
export function toggleFullScreen(frame: HTMLElement | null, video: HTMLVideoElement | null): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined)
  } else if (frame?.requestFullscreen) {
    void frame.requestFullscreen().catch(() => undefined)
  } else {
    ;(video as WebkitVideo | null)?.webkitEnterFullscreen?.()
  }
}
