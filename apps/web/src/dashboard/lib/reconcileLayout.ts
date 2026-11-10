import type { Device } from '../types'
import type { TileSize } from './tileSize'

/** One stored card of an arrangement. */
export type LayoutEntry = { deviceId: string; size: TileSize }

/** A card to render: the live device and its size. */
export type ArrangedTile = { device: Device; size: TileSize }

/**
 * Applies a stored arrangement to the tab's live devices (already in server order): stored entries
 * keep their order and size, entries for devices not in the tab are dropped, and devices without an
 * entry are appended at 1×1.
 */
export function reconcileLayout(entries: readonly LayoutEntry[] | undefined, devices: readonly Device[]): ArrangedTile[] {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const placed: ArrangedTile[] = []
  for (const entry of entries ?? []) {
    const device = byId.get(entry.deviceId)
    if (!device) continue
    placed.push({ device, size: entry.size })
    byId.delete(entry.deviceId)
  }
  return [...placed, ...[...byId.values()].map((device) => ({ device, size: 'S1x1' as const }))]
}
