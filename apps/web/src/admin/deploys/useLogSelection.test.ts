import { act, renderHook } from '@testing-library/react'
import { deployEventFixture } from '../../test/deployFixtures'
import { useLogSelection } from './useLogSelection'

const A = deployEventFixture({ id: 'a' })
const B = deployEventFixture({ id: 'b' })
const RUNNING = deployEventFixture({ id: 'r', status: 'RUNNING', finishedAt: null })

describe('useLogSelection', () => {
  it('opens the running event, else the newest', () => {
    expect(renderHook(() => useLogSelection([A, RUNNING], false)).result.current.selected?.id).toBe('r')
    expect(renderHook(() => useLogSelection([A, B], false)).result.current.selected?.id).toBe('a')
  })

  it('switches to the picked event', () => {
    const { result } = renderHook(() => useLogSelection([A, B], false))
    act(() => result.current.select('b'))
    expect(result.current.selected?.id).toBe('b')
  })

  it('keeps the open event on desktop when tapped again', () => {
    const { result } = renderHook(() => useLogSelection([A, B], false))
    act(() => result.current.select('a'))
    expect(result.current.selected?.id).toBe('a')
  })

  it('closes the open row on a phone when tapped again, and reopens on the next tap', () => {
    const { result } = renderHook(() => useLogSelection([A, B], true))
    act(() => result.current.select('a'))
    expect(result.current.selected).toBeNull()
    act(() => result.current.select('a'))
    expect(result.current.selected?.id).toBe('a')
  })
})
