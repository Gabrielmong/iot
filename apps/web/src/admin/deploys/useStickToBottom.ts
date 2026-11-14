import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react'

/** How close to the end (px) still counts as "at the bottom". */
const SLACK = 24

/**
 * Keeps a scrollable element pinned to its last line as content grows, until the user scrolls up.
 * Scrolling back to the end (or calling jumpToEnd) pins it again. Mount with a fresh key per document.
 */
export function useStickToBottom<T extends HTMLElement>(content: unknown): {
  ref: RefObject<T | null>
  pinned: boolean
  onScroll: () => void
  jumpToEnd: () => void
} {
  const ref = useRef<T>(null)
  const pinnedRef = useRef(true)
  const [pinned, setPinned] = useState(true)

  const setPin = useCallback((value: boolean) => {
    pinnedRef.current = value
    setPinned(value)
  }, [])

  const jumpToEnd = useCallback(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
    setPin(true)
  }, [setPin])

  useLayoutEffect(() => {
    const el = ref.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [content])

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight <= SLACK
    if (atEnd !== pinnedRef.current) setPin(atEnd)
  }, [setPin])

  return { ref, pinned, onScroll, jumpToEnd }
}
