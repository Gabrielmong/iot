import type { Device, Room } from '../types'
import type { ArrangedTile } from './reconcileLayout'

export type DeviceGroup = { room: string; devices: Device[] }

const NO_ROOM = 'No room'

/**
 * The devices that can still go on Home: those not already placed, grouped by room name in the rooms'
 * order (`rooms`; a room it doesn't list goes after them), devices by name, and "No room" last.
 */
export function devicesToAdd(all: readonly Device[], tiles: readonly ArrangedTile[], rooms: readonly Room[] = []): DeviceGroup[] {
  const placed = new Set(tiles.flatMap((t) => ('device' in t ? [t.device.id] : [])))
  const order = new Map(rooms.map((r) => [r.id, r.sortOrder]))
  const groups = new Map<string, DeviceGroup & { rank: number }>()
  for (const device of all) {
    if (placed.has(device.id)) continue
    const key = device.room?.id ?? ''
    const group = groups.get(key) ?? { room: device.room?.name ?? NO_ROOM, devices: [], rank: device.room ? (order.get(device.room.id) ?? Number.MAX_SAFE_INTEGER) : Infinity }
    group.devices.push(device)
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.room.localeCompare(b.room))
    .map(({ room, devices }) => ({ room, devices: devices.sort((a, b) => a.name.localeCompare(b.name)) }))
}
