import { renderHook } from '@testing-library/react'
import { useScrollMemory } from './useScrollMemory'

describe('useScrollMemory', () => {
  const scrollTo = vi.fn()
  beforeEach(() => {
    scrollTo.mockClear()
    vi.stubGlobal('scrollTo', scrollTo)
  })
  afterEach(() => vi.unstubAllGlobals())
  const scrolledTo = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true })

  it('puts a room back where it was scrolled when it is shown again, once its tiles are there', () => {
    scrolledTo(420)
    const first = renderHook(() => useScrollMemory('/rooms/r2', true))
    first.unmount()
    scrolledTo(0)
    const again = renderHook(({ ready }) => useScrollMemory('/rooms/r2', ready), { initialProps: { ready: false } })
    expect(scrollTo).not.toHaveBeenCalled()
    again.rerender({ ready: true })
    expect(scrollTo).toHaveBeenCalledWith(0, 420)
    again.rerender({ ready: true })
    expect(scrollTo).toHaveBeenCalledOnce()
  })

  it('leaves a room never scrolled alone', () => {
    renderHook(() => useScrollMemory('/rooms/new', true))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
