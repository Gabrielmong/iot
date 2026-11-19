import type { Device, Room } from '../types'

export const ALL_TAB = 'all'

/** The curated Home page's layout tab: devices from any room, shown only once placed. */
export const HOME_TAB = 'home'

/** Rooms that contain at least one of `devices`, ordered by sortOrder. */
export function roomTabs(rooms: readonly Room[], devices: readonly Device[]): Room[] {
  const used = new Set(devices.map((d) => d.room?.id))
  return rooms.filter((r) => used.has(r.id)).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Devices shown under a tab (`ALL_TAB` or a room id); Home can draw on every device. */
export function devicesInTab(devices: readonly Device[], tab: string): Device[] {
  return tab === ALL_TAB || tab === HOME_TAB ? [...devices] : devices.filter((d) => d.room?.id === tab)
}
