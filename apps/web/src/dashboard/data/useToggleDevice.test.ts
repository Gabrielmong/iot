import { renderHook } from '@testing-library/react'
import { deviceFixture } from '../../test/deviceFixtures'
import { useToggleDevice } from './useToggleDevice'

describe('useToggleDevice', () => {
  it('flips on for a plug', () => {
    const setState = vi.fn(async () => {})
    const { result } = renderHook(() => useToggleDevice(setState))
    const plug = deviceFixture({ on: true })
    void result.current(plug)
    expect(setState).toHaveBeenCalledWith(plug, { on: false })
  })

  it('always wakes a computer, even one that is already awake', () => {
    const setState = vi.fn(async () => {})
    const { result } = renderHook(() => useToggleDevice(setState))
    const pc = deviceFixture({ kind: 'COMPUTER', brand: 'WOL', on: true })
    void result.current(pc)
    expect(setState).toHaveBeenCalledWith(pc, { on: true })
  })
})
