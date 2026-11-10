import type { DeviceKind } from '../../gql/graphql'
import type { AdminDevice } from '../types'
import { deviceHealth, type DeviceHealth } from './deviceStatus'

export type DeviceFilters = { search: string; room: string; kind: DeviceKind | 'any'; health: DeviceHealth | 'any' }
/** `room`: a room id, `'any'`, or `'none'` for devices without a room. */
export const NO_FILTERS: DeviceFilters = { search: '', room: 'any', kind: 'any', health: 'any' }

export type SortKey = 'name' | 'room' | 'model' | 'ip' | 'health' | 'lastSeen'
export type Sort = { key: SortKey; dir: 'asc' | 'desc' }
export const DEFAULT_SORT: Sort = { key: 'room', dir: 'asc' }

const matchesSearch = (d: AdminDevice, q: string) =>
  [d.name, d.model, d.ip, d.room?.name].some((field) => field?.toLowerCase().includes(q))

/** Devices matching the search (name, model, address, room; any case) and every filter. */
export function filterDevices(devices: readonly AdminDevice[], f: DeviceFilters): AdminDevice[] {
  const q = f.search.trim().toLowerCase()
  return devices.filter(
    (d) =>
      (!q || matchesSearch(d, q)) &&
      (f.room === 'any' || (f.room === 'none' ? !d.room : d.room?.id === f.room)) &&
      (f.kind === 'any' || d.kind === f.kind) &&
      (f.health === 'any' || deviceHealth(d) === f.health),
  )
}

const HEALTH_ORDER: Record<DeviceHealth, number> = { setup: 0, offline: 1, online: 2 }
const text = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return Number(!a) - Number(!b) // missing values sort last
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/** Ascending comparators; `lastSeen` ascending means most recent first. Missing values go last when ascending. */
const COMPARE: Record<SortKey, (a: AdminDevice, b: AdminDevice) => number> = {
  name: (a, b) => text(a.name, b.name),
  room: (a, b) => text(a.room?.name, b.room?.name) || text(a.name, b.name),
  model: (a, b) => text(a.model, b.model),
  ip: (a, b) => text(a.ip, b.ip),
  health: (a, b) => HEALTH_ORDER[deviceHealth(a)] - HEALTH_ORDER[deviceHealth(b)],
  lastSeen: (a, b) => {
    if (!a.lastSeenAt || !b.lastSeenAt) return Number(!a.lastSeenAt) - Number(!b.lastSeenAt)
    return b.lastSeenAt.localeCompare(a.lastSeenAt)
  },
}

export function sortDevices(devices: readonly AdminDevice[], sort: Sort): AdminDevice[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...devices].sort((a, b) => sign * COMPARE[sort.key](a, b))
}
