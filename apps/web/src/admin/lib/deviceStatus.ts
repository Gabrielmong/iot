import type { AdminDevice } from '../types'

/** One status per device for the admin table: setup problems win over being offline. */
export type DeviceHealth = 'online' | 'offline' | 'setup'

export const HEALTH_LABEL: Record<DeviceHealth, string> = { online: 'Online', offline: 'Offline', setup: 'Needs setup' }

export const HEALTH_COLOR: Record<DeviceHealth, 'success' | 'warning' | 'error'> = { online: 'success', setup: 'warning', offline: 'error' }

export function deviceHealth(d: Pick<AdminDevice, 'status' | 'online'>): DeviceHealth {
  if (d.status !== 'OK') return 'setup'
  return d.online ? 'online' : 'offline'
}

/** The chip text: a TV to pair says so; other setup problems say "Needs setup". */
export function healthLabel(d: Pick<AdminDevice, 'status' | 'online'>): string {
  return d.status === 'NEEDS_PAIRING' ? 'Needs pairing' : HEALTH_LABEL[deviceHealth(d)]
}

export function healthCounts(devices: readonly Pick<AdminDevice, 'status' | 'online'>[]): Record<DeviceHealth, number> {
  const counts: Record<DeviceHealth, number> = { online: 0, offline: 0, setup: 0 }
  for (const d of devices) counts[deviceHealth(d)]++
  return counts
}
