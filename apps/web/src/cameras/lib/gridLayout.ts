export const LAYOUTS = [1, 2, 4, 6, 8, 16] as const
export type Layout = (typeof LAYOUTS)[number]

const SHAPES: Record<Layout, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
  16: { cols: 4, rows: 4 },
}

/** Phones show at most this many tiles at once. */
export const PHONE_MAX_TILES = 4

export const isLayout = (n: number): n is Layout => (LAYOUTS as readonly number[]).includes(n)

/** Columns, rows and tiles per page for a layout; on phones anything above 4 becomes a 2×2 page. */
export function gridShape(layout: Layout, phone: boolean): { cols: number; rows: number; perPage: number } {
  const shape = phone && layout > PHONE_MAX_TILES ? SHAPES[PHONE_MAX_TILES] : SHAPES[layout]
  return { ...shape, perPage: shape.cols * shape.rows }
}

/** Pages needed for `total` cameras (always at least 1). */
export const pageCount = (total: number, perPage: number): number => Math.max(1, Math.ceil(total / perPage))

/** A valid page index for the current selection (it may have shrunk under the viewer). */
export const clampPage = (page: number, total: number, perPage: number): number => Math.min(Math.max(0, page), pageCount(total, perPage) - 1)

export const pageItems = <T>(items: readonly T[], page: number, perPage: number): T[] => items.slice(page * perPage, (page + 1) * perPage)
