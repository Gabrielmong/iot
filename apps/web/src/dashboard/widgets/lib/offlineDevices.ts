import type { Device } from '../../types'

/** Devices that should answer but don't: set up (status OK), not a computer (off is normal), and offline. By name. */
export function offlineDevices(devices: readonly Device[]): Device[] {
  return devices
    .filter((d) => d.kind !== 'COMPUTER' && d.status === 'OK' && d.state.online === false)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** "All devices online", "1 device offline", "3 devices offline". */
export function offlineText(count: number): string {
  if (count === 0) return 'All devices online'
  return `${count} ${count === 1 ? 'device' : 'devices'} offline`
}
