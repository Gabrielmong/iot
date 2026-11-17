import { useCallback, useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}
const isFullScreen = () => document.fullscreenElement !== null && document.fullscreenElement !== undefined

/** Whole-app full screen (e.g. a wall tablet). `supported` is false where the browser can't (iPhone Safari). */
export function useFullScreen() {
  const active = useSyncExternalStore(subscribe, isFullScreen, () => false)
  const toggle = useCallback(() => {
    if (isFullScreen()) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen?.().catch(() => undefined)
  }, [])
  return { supported: Boolean(document.fullscreenEnabled), active, toggle }
}
