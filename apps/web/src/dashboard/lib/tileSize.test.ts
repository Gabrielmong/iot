import { TILE_SIZE_LABEL, TILE_SIZES, tileSpan } from './tileSize'

describe('tileSpan', () => {
  it('maps each size to columns × rows', () => {
    expect(tileSpan('S1x1')).toEqual({ cols: 1, rows: 1 })
    expect(tileSpan('W2x1')).toEqual({ cols: 2, rows: 1 })
    expect(tileSpan('T1x2')).toEqual({ cols: 1, rows: 2 })
    expect(tileSpan('L2x2')).toEqual({ cols: 2, rows: 2 })
  })

  it('labels the four sizes in order', () => {
    expect(TILE_SIZES.map((s) => TILE_SIZE_LABEL[s])).toEqual(['1×1', '2×1', '1×2', '2×2'])
  })
})
