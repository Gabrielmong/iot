import { useEffect, useState } from 'react'

/** The current time, refreshed every `intervalMs` while `active` (for countdowns). */
export function useNow(intervalMs: number, active = true): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, active])
  return now
}
