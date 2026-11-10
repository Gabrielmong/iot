import { act, renderHook } from '@testing-library/react'
import { useArrangeDraft } from './useArrangeDraft'

const entries = [
  { deviceId: 'a', size: 'S1x1' as const },
  { deviceId: 'b', size: 'W2x1' as const },
]

describe('useArrangeDraft', () => {
  it('holds a tab and its entries from start until stopped', () => {
    const { result } = renderHook(() => useArrangeDraft())
    expect(result.current.draft).toBeNull()
    act(() => result.current.start('r1', entries))
    expect(result.current.draft).toEqual({ tab: 'r1', entries })
    act(() => result.current.set([entries[1]]))
    expect(result.current.draft).toEqual({ tab: 'r1', entries: [entries[1]] })
    act(() => result.current.stop())
    expect(result.current.draft).toBeNull()
  })

  it('ignores edits when not arranging', () => {
    const { result } = renderHook(() => useArrangeDraft())
    act(() => result.current.set(entries))
    expect(result.current.draft).toBeNull()
  })
})
