import type { Device, Room } from '../types'
import { devicesToTurnOff } from './devicesToTurnOff'
import { ALL_TAB, devicesInTab, roomTabs } from './roomTabs'
import { visibleTiles } from './visibleTiles'

export type RoomSummary = { id: string; name: string; deviceCount: number; onCount: number }

export const ALL_DEVICES_NAME = 'All devices'

/** The room cards: rooms with visible devices (by sortOrder), then "All devices". "On" counts what All off would switch off. */
export function roomSummaries(devices: readonly Device[], rooms: readonly Room[]): RoomSummary[] {
  const tiles = visibleTiles(devices)
  const summary = (id: string, name: string): RoomSummary => {
    const inRoom = devicesInTab(tiles, id)
    return { id, name, deviceCount: inRoom.length, onCount: devicesToTurnOff(inRoom).length }
  }
  return [...roomTabs(rooms, tiles).map((r) => summary(r.id, r.name)), summary(ALL_TAB, ALL_DEVICES_NAME)]
}
