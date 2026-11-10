import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

export const REPEAT_MS = 200

/**
 * Pointer handlers for a remote button: `fire` on press and, when `repeat`, every 200 ms while held;
 * the hold ends on pointer up, leave or cancel. A keyboard click (detail 0) fires once; the click that
 * follows a pointer press is ignored because the press already fired.
 */
export function useHoldRepeat(fire: () => void, repeat: boolean) {
  const latest = useRef(fire)
  useLayoutEffect(() => {
    latest.current = fire
  })
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  const stop = useCallback(() => {
    clearInterval(timer.current)
    timer.current = undefined
  }, [])

  const onPointerDown = useCallback(() => {
    stop()
    latest.current()
    if (repeat) timer.current = setInterval(() => latest.current(), REPEAT_MS)
  }, [repeat, stop])

  const onClick = useCallback((e: { detail: number }) => {
    if (e.detail === 0) latest.current()
  }, [])

  useEffect(() => stop, [stop])

  return { onPointerDown, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, onClick }
}
