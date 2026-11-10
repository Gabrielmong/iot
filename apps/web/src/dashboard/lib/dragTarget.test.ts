import { isNewDragTarget } from './dragTarget'

describe('isNewDragTarget', () => {
  it('moves onto a different card the first time it is reached', () => {
    expect(isNewDragTarget(null, 'a', 'b')).toBe(true)
  })

  it('ignores the dragged card itself and the card it just swapped with', () => {
    expect(isNewDragTarget(null, 'a', 'a')).toBe(false)
    expect(isNewDragTarget('b', 'a', 'b')).toBe(false)
  })

  it('ignores having no card under the pointer', () => {
    expect(isNewDragTarget('b', 'a', null)).toBe(false)
  })
})
