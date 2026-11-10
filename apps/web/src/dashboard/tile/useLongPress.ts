import { type MouseEvent, type PointerEvent, useCallback, useEffect, useRef } from 'react'

export const LONG_PRESS_MS = 500

type Options = { onLongPress: () => void; onClick: () => void; delay?: number }

/**
 * Handlers to spread on an element: a touch held for `delay` ms calls `onLongPress` (and the
 * click that follows is swallowed); anything shorter is a normal click. Mouse uses the ⋯ button.
 */
export function useLongPress({ onLongPress, onClick, delay = LONG_PRESS_MS }: Options) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fired = useRef(false)
  const lastPointer = useRef<string | null>(null)

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  useEffect(() => cancel, [cancel])

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      fired.current = false
      lastPointer.current = e.pointerType
      if (e.pointerType === 'mouse') return
      cancel()
      timer.current = setTimeout(() => {
        fired.current = true
        onLongPress()
      }, delay)
    },
    [cancel, delay, onLongPress],
  )

  const handleClick = useCallback(() => {
    if (fired.current) {
      fired.current = false
      return
    }
    onClick()
  }, [onClick])

  // A keyboard press is never the tail of a long-press, even if the touch produced no click.
  const onKeyDown = useCallback(() => {
    fired.current = false
  }, [])

  // Android opens a context menu on long-press; the details page replaces it. Desktop right-click keeps it.
  const onContextMenu = useCallback((e: MouseEvent) => {
    if (lastPointer.current !== null && lastPointer.current !== 'mouse') e.preventDefault()
  }, [])

  return {
    onPointerDown,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: handleClick,
    onKeyDown,
    onContextMenu,
  }
}
