import { useEffect } from 'react'
import { ACTIVITY_EVENTS } from './activityEvents'

export const IDLE_LOGOUT_MS = 180_000

/** When `active`, calls `onIdle` after IDLE_LOGOUT_MS without a pointerdown or keydown. */
export function useIdleLogout(active: boolean, onIdle: () => void, timeoutMs = IDLE_LOGOUT_MS): void {
  useEffect(() => {
    if (!active) return
    let timer = setTimeout(onIdle, timeoutMs)
    const restart = () => {
      clearTimeout(timer)
      timer = setTimeout(onIdle, timeoutMs)
    }
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, restart))
    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, restart))
    }
  }, [active, onIdle, timeoutMs])
}
