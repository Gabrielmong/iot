/** A dashboard card's size: 1×1, 2×1 (wide), 1×2 (tall) or 2×2. Matches the API's TileSize enum. */
export type TileSize = 'S1x1' | 'W2x1' | 'T1x2' | 'L2x2'

export const TILE_SIZES: readonly TileSize[] = ['S1x1', 'W2x1', 'T1x2', 'L2x2']

export const TILE_SIZE_LABEL: Record<TileSize, string> = { S1x1: '1×1', W2x1: '2×1', T1x2: '1×2', L2x2: '2×2' }

const SPANS: Record<TileSize, { cols: 1 | 2; rows: 1 | 2 }> = {
  S1x1: { cols: 1, rows: 1 },
  W2x1: { cols: 2, rows: 1 },
  T1x2: { cols: 1, rows: 2 },
  L2x2: { cols: 2, rows: 2 },
}

/** How many grid columns and rows a card of this size covers. */
export function tileSpan(size: TileSize): { cols: 1 | 2; rows: 1 | 2 } {
  return SPANS[size]
}
