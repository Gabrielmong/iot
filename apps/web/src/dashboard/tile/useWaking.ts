import { useCallback, useEffect, useRef, useState } from 'react'

const WAKING_MS = 5000

/** `[waking, startWaking]`: true for 5 s after a wake, then the probe's state shows again. */
export function useWaking(): [boolean, () => void] {
  const [waking, setWaking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const start = useCallback(() => {
    clearTimeout(timer.current)
    setWaking(true)
    timer.current = setTimeout(() => setWaking(false), WAKING_MS)
  }, [])
  return [waking, start]
}
