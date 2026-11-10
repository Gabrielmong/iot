import { useCallback, useEffect, useRef } from 'react'
import { NUDGE_MS } from './timing'

type Options = { start: () => void; stop: () => void; repeatMs: number; nudgeMs?: number }

/**
 * Press-and-hold for a button: `start` on press and every `repeatMs` while held; `stop` exactly once
 * when the hold ends (release, cancel, leaving the button, the tab going hidden, or unmount). A tap
 * shorter than `nudgeMs` keeps going until `nudgeMs` has passed, so it still moves a little.
 */
export function useHoldAction({ start, stop, repeatMs, nudgeMs = NUDGE_MS }: Options) {
  const latest = useRef({ start, stop })
  latest.current = { start, stop }
  const hold = useRef<{ pressedAt: number; repeat: ReturnType<typeof setInterval>; nudge?: ReturnType<typeof setTimeout> } | null>(null)

  const finish = useCallback(() => {
    const h = hold.current
    if (!h) return
    hold.current = null
    clearInterval(h.repeat)
    clearTimeout(h.nudge)
    latest.current.stop()
  }, [])

  const release = useCallback(() => {
    const h = hold.current
    if (!h || h.nudge !== undefined) return
    clearInterval(h.repeat)
    const left = nudgeMs - (Date.now() - h.pressedAt)
    if (left <= 0) finish()
    else h.nudge = setTimeout(finish, left)
  }, [finish, nudgeMs])

  const press = useCallback(() => {
    if (hold.current) finish()
    latest.current.start()
    hold.current = { pressedAt: Date.now(), repeat: setInterval(() => latest.current.start(), repeatMs) }
  }, [finish, repeatMs])

  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && finish()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      finish()
    }
  }, [finish])

  return { onPointerDown: press, onPointerUp: release, onPointerCancel: finish, onPointerLeave: release }
}
