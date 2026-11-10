import type { RoomSummary } from '../lib/roomSummaries'

/** "2 devices · 1 on", or just the count when nothing is on. */
export function roomCaption({ deviceCount, onCount }: Pick<RoomSummary, 'deviceCount' | 'onCount'>): string {
  const devices = `${deviceCount} ${deviceCount === 1 ? 'device' : 'devices'}`
  return onCount > 0 ? `${devices} · ${onCount} on` : devices
}
