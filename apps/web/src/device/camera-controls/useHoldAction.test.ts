import { act, renderHook } from '@testing-library/react'
import { resetDocumentVisibility, setDocumentVisible } from '../../test/mediaStubs'
import { NUDGE_MS } from './timing'
import { useHoldAction } from './useHoldAction'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  resetDocumentVisibility()
})

function setup(repeatMs = 1500) {
  const start = vi.fn()
  const stop = vi.fn()
  const view = renderHook(() => useHoldAction({ start, stop, repeatMs }))
  return { start, stop, ...view }
}

describe('useHoldAction', () => {
  it('press calls start, repeats every repeatMs while held, and release calls stop once', () => {
    const { start, stop, result } = setup()
    act(() => result.current.onPointerDown())
    expect(start).toHaveBeenCalledTimes(1)
    act(() => void vi.advanceTimersByTime(3000))
    expect(start).toHaveBeenCalledTimes(3)
    act(() => result.current.onPointerUp())
    act(() => result.current.onPointerLeave())
    act(() => void vi.advanceTimersByTime(5000))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(3)
  })

  it('a tap shorter than NUDGE_MS still runs for NUDGE_MS, then stops', () => {
    const { start, stop, result } = setup()
    act(() => result.current.onPointerDown())
    act(() => void vi.advanceTimersByTime(50))
    act(() => result.current.onPointerUp())
    expect(stop).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(NUDGE_MS - 51))
    expect(stop).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it.each(['onPointerCancel', 'onPointerLeave'] as const)('%s stops once', (handler) => {
    const { stop, result } = setup()
    act(() => result.current.onPointerDown())
    act(() => void vi.advanceTimersByTime(1000))
    act(() => result.current[handler]())
    act(() => result.current.onPointerUp())
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('unmount stops once, even during a nudge', () => {
    const { stop, result, unmount } = setup()
    act(() => result.current.onPointerDown())
    act(() => result.current.onPointerUp())
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
    act(() => void vi.advanceTimersByTime(NUDGE_MS))
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('unmount while idle does not stop', () => {
    const { stop, unmount } = setup()
    unmount()
    expect(stop).not.toHaveBeenCalled()
  })

  it('the tab going hidden stops once', () => {
    const { stop, result } = setup()
    act(() => result.current.onPointerDown())
    act(() => setDocumentVisible(false))
    expect(stop).toHaveBeenCalledTimes(1)
    act(() => result.current.onPointerUp())
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('a second press after release starts again', () => {
    const { start, stop, result } = setup()
    act(() => result.current.onPointerDown())
    act(() => void vi.advanceTimersByTime(1000))
    act(() => result.current.onPointerUp())
    act(() => result.current.onPointerDown())
    expect(start).toHaveBeenCalledTimes(2)
    act(() => result.current.onPointerUp())
    act(() => void vi.advanceTimersByTime(NUDGE_MS))
    expect(stop).toHaveBeenCalledTimes(2)
  })
})
