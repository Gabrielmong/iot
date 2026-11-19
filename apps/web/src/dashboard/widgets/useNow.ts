import { useEffect, useState } from 'react'

const MINUTE = 60_000

/** The current time, updated at the start of every minute (widgets never show seconds). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const tick = () => setNow(new Date())
    const timeout = setTimeout(() => {
      tick()
      interval = setInterval(tick, MINUTE)
    }, MINUTE - (Date.now() % MINUTE))
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])
  return now
}
