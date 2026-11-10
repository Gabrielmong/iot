import type { ArrangedTile, LayoutEntry } from './reconcileLayout'
import type { TileSize } from './tileSize'

/** Moves the active entry to where `overId` is (array-move semantics); unknown ids leave the list as is. */
export function moveEntry(list: LayoutEntry[], activeId: string, overId: string): LayoutEntry[] {
  const from = list.findIndex((e) => e.deviceId === activeId)
  const to = list.findIndex((e) => e.deviceId === overId)
  if (from < 0 || to < 0 || from === to) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Sets one entry's size. */
export function resizeEntry(list: LayoutEntry[], deviceId: string, size: TileSize): LayoutEntry[] {
  return list.map((e) => (e.deviceId === deviceId ? { ...e, size } : e))
}

/** The entries an arrangement of tiles stores. */
export function toEntries(tiles: readonly ArrangedTile[]): LayoutEntry[] {
  return tiles.map(({ device, size }) => ({ deviceId: device.id, size }))
}

/** Moves an entry one or more places along the list (keyboard arranging); stays put past the ends. */
export function moveEntryBy(list: LayoutEntry[], deviceId: string, delta: number): LayoutEntry[] {
  const from = list.findIndex((e) => e.deviceId === deviceId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return list
  return moveEntry(list, deviceId, list[to].deviceId)
}
