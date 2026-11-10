import { clampPage, gridShape, pageCount, pageItems } from './gridLayout'

describe('gridLayout', () => {
  it('shapes each layout on desktop', () => {
    expect([1, 2, 4, 6, 8, 16].map((l) => gridShape(l as never, false))).toEqual([
      { cols: 1, rows: 1, perPage: 1 },
      { cols: 2, rows: 1, perPage: 2 },
      { cols: 2, rows: 2, perPage: 4 },
      { cols: 3, rows: 2, perPage: 6 },
      { cols: 4, rows: 2, perPage: 8 },
      { cols: 4, rows: 4, perPage: 16 },
    ])
  })

  it('caps phones at 4 tiles per page, keeping 1 and 2 as they are', () => {
    expect(gridShape(16, true)).toEqual({ cols: 2, rows: 2, perPage: 4 })
    expect(gridShape(6, true)).toEqual({ cols: 2, rows: 2, perPage: 4 })
    expect(gridShape(2, true)).toEqual({ cols: 2, rows: 1, perPage: 2 })
    expect(gridShape(1, true)).toEqual({ cols: 1, rows: 1, perPage: 1 })
  })

  it('pages cameras', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(pageCount(6, 4)).toBe(2)
    expect(pageCount(0, 4)).toBe(1)
    expect(pageItems(six, 0, 4)).toEqual(['a', 'b', 'c', 'd'])
    expect(pageItems(six, 1, 4)).toEqual(['e', 'f'])
  })

  it('clamps the page when the selection shrinks', () => {
    expect(clampPage(1, 3, 4)).toBe(0)
    expect(clampPage(3, 9, 4)).toBe(2)
    expect(clampPage(-1, 9, 4)).toBe(0)
  })
})
