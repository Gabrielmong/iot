export type RoomGroup<T> = { roomId: string | null; name: string; devices: T[] }

export const NO_ROOM = 'No room'

/**
 * Groups devices by room: rooms in the given (sortOrder) order, empty rooms left out,
 * devices without a room last under "No room".
 */
export function groupDevicesByRoom<T extends { room: { id: string; name: string } | null }>(
  devices: readonly T[],
  rooms: readonly { id: string }[],
): RoomGroup<T>[] {
  const groups = new Map<string | null, RoomGroup<T>>()
  for (const device of devices) {
    const key = device.room?.id ?? null
    const group = groups.get(key) ?? { roomId: key, name: device.room?.name ?? NO_ROOM, devices: [] }
    group.devices.push(device)
    groups.set(key, group)
  }
  const position = (id: string | null) => {
    if (id === null) return Number.MAX_SAFE_INTEGER
    const index = rooms.findIndex((r) => r.id === id)
    return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index
  }
  return [...groups.values()].sort((a, b) => position(a.roomId) - position(b.roomId))
}
