import { useCallback, useEffect, useRef, useState } from 'react'
import { IDLE_MS } from './timing'

/** Visible on mount and after each `wake`; hidden after `idleMs` without one. */
export function useOverlayIdle(idleMs = IDLE_MS) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const wake = useCallback(() => {
    setVisible(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), idleMs)
  }, [idleMs])

  useEffect(() => {
    wake()
    return () => clearTimeout(timer.current)
  }, [wake])

  return { visible, wake }
}
