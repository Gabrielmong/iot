import { act, renderHook } from '@testing-library/react'
import { useHoldRepeat } from './useHoldRepeat'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useHoldRepeat', () => {
  it('fires at once, then every 200 ms while held, and stops on release', () => {
    const fire = vi.fn()
    const { result } = renderHook(() => useHoldRepeat(fire, true))
    act(() => result.current.onPointerDown())
    act(() => void vi.advanceTimersByTime(650))
    expect(fire).toHaveBeenCalledTimes(4)
    act(() => result.current.onPointerUp())
    act(() => void vi.advanceTimersByTime(1000))
    expect(fire).toHaveBeenCalledTimes(4)
  })

  it('stops when the pointer leaves or is cancelled', () => {
    const fire = vi.fn()
    const { result } = renderHook(() => useHoldRepeat(fire, true))
    act(() => result.current.onPointerDown())
    act(() => result.current.onPointerLeave())
    act(() => result.current.onPointerDown())
    act(() => result.current.onPointerCancel())
    act(() => void vi.advanceTimersByTime(1000))
    expect(fire).toHaveBeenCalledTimes(2)
  })

  it('fires once when repeat is off', () => {
    const fire = vi.fn()
    const { result } = renderHook(() => useHoldRepeat(fire, false))
    act(() => result.current.onPointerDown())
    act(() => void vi.advanceTimersByTime(1000))
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('a keyboard click (no pointer) fires once', () => {
    const fire = vi.fn()
    const { result } = renderHook(() => useHoldRepeat(fire, true))
    act(() => result.current.onClick({ detail: 0 }))
    act(() => result.current.onClick({ detail: 1 })) // the click after a pointer press: already fired
    expect(fire).toHaveBeenCalledTimes(1)
  })
})
