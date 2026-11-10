import type { Device, Room } from '../types'

export const ALL_TAB = 'all'

/** Rooms that contain at least one of `devices`, ordered by sortOrder. */
export function roomTabs(rooms: readonly Room[], devices: readonly Device[]): Room[] {
  const used = new Set(devices.map((d) => d.room?.id))
  return rooms.filter((r) => used.has(r.id)).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Devices shown under a tab (`ALL_TAB` or a room id). */
export function devicesInTab(devices: readonly Device[], tab: string): Device[] {
  return tab === ALL_TAB ? [...devices] : devices.filter((d) => d.room?.id === tab)
}
