import { renderHook } from '@testing-library/react'
import { IDLE_LOGOUT_MS, useIdleLogout } from './useIdleLogout'

describe('useIdleLogout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses a 3 minute timeout', () => {
    expect(IDLE_LOGOUT_MS).toBe(180_000)
  })

  it('calls onIdle after 180000 ms without activity when shared', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle))
    vi.advanceTimersByTime(179_999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('does nothing when not shared', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(false, onIdle))
    vi.advanceTimersByTime(IDLE_LOGOUT_MS * 2)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it.each(['pointerdown', 'keydown'])('restarts the countdown on %s', (type) => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle))
    vi.advanceTimersByTime(150_000)
    document.dispatchEvent(new Event(type))
    vi.advanceTimersByTime(150_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('stops listening on unmount', () => {
    const onIdle = vi.fn()
    const { unmount } = renderHook(() => useIdleLogout(true, onIdle))
    unmount()
    vi.advanceTimersByTime(IDLE_LOGOUT_MS * 2)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
