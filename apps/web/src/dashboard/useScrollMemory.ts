import { useEffect, useRef } from 'react'

/** Last scroll position per view, for this tab's lifetime. */
const positions = new Map<string, number>()

/**
 * Remembers how far `key`'s view was scrolled when it was left, and scrolls back there once it is shown
 * again and `ready` (its tiles are on screen, so the page is tall enough).
 */
export function useScrollMemory(key: string, ready: boolean): void {
  const restored = useRef(false)
  useEffect(() => {
    restored.current = false
    return () => void positions.set(key, window.scrollY)
  }, [key])
  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    const y = positions.get(key)
    if (y) window.scrollTo(0, y)
  }, [key, ready])
}
