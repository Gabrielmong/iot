import { useEffect } from 'react'
import { ACTIVITY_EVENTS } from './activityEvents'

export const KEEP_ALIVE_MS = 60_000

/**
 * When `active`, calls `ping` on user activity at most once per KEEP_ALIVE_MS. Activity inside the
 * window gets one trailing ping at its end, so the server session always outlives the last activity
 * (the server slides it only on user-initiated requests). No activity, no pings.
 */
export function useSessionKeepAlive(active: boolean, ping: () => void, intervalMs = KEEP_ALIVE_MS): void {
  useEffect(() => {
    if (!active) return
    let lastPing = -Infinity
    let trailing: ReturnType<typeof setTimeout> | undefined
    const fire = () => {
      trailing = undefined
      lastPing = Date.now()
      ping()
    }
    const onActivity = () => {
      const wait = lastPing + intervalMs - Date.now()
      if (wait <= 0) fire()
      else if (!trailing) trailing = setTimeout(fire, wait)
    }
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, onActivity))
    return () => {
      clearTimeout(trailing)
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity))
    }
  }, [active, ping, intervalMs])
}
