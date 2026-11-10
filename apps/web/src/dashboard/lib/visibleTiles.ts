import type { Device } from '../types'

/** Devices to show as tiles: a power strip is hidden when its outlets are shown individually. */
export function visibleTiles(devices: readonly Device[]): Device[] {
  const parents = new Set(devices.map((d) => d.parentId).filter((id): id is string => id != null))
  return devices.filter((d) => !parents.has(d.id))
}
