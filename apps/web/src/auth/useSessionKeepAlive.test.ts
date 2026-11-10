import { renderHook } from '@testing-library/react'
import { KEEP_ALIVE_MS, useSessionKeepAlive } from './useSessionKeepAlive'

const tap = () => document.dispatchEvent(new Event('pointerdown'))

describe('useSessionKeepAlive', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pings at most once per 60 s', () => {
    expect(KEEP_ALIVE_MS).toBe(60_000)
  })

  it('sends nothing without activity', () => {
    const ping = vi.fn()
    renderHook(() => useSessionKeepAlive(true, ping))
    vi.advanceTimersByTime(KEEP_ALIVE_MS * 5)
    expect(ping).not.toHaveBeenCalled()
  })

  it('pings on activity, then at most once per 60 s however much activity follows', () => {
    const ping = vi.fn()
    renderHook(() => useSessionKeepAlive(true, ping))
    tap()
    expect(ping).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 59; i++) {
      vi.advanceTimersByTime(1_000)
      tap()
      document.dispatchEvent(new Event('keydown'))
    }
    expect(ping).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)
    expect(ping).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(KEEP_ALIVE_MS * 3)
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('covers activity inside the window with one trailing ping, so the session outlives the last activity', () => {
    const ping = vi.fn()
    renderHook(() => useSessionKeepAlive(true, ping))
    tap()
    vi.advanceTimersByTime(30_000)
    tap()
    expect(ping).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('does nothing when not active', () => {
    const ping = vi.fn()
    renderHook(() => useSessionKeepAlive(false, ping))
    tap()
    vi.advanceTimersByTime(KEEP_ALIVE_MS * 2)
    expect(ping).not.toHaveBeenCalled()
  })

  it('stops listening and cancels a pending ping on unmount', () => {
    const ping = vi.fn()
    const { unmount } = renderHook(() => useSessionKeepAlive(true, ping))
    tap()
    tap()
    unmount()
    vi.advanceTimersByTime(KEEP_ALIVE_MS * 2)
    tap()
    expect(ping).toHaveBeenCalledTimes(1)
  })
})
