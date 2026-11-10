import { useGrants } from '../../admin/data/useGrants'
import { useDevices } from '../../dashboard/data/useDevices'

/**
 * Devices the routine may use: the caller's own, or, when an admin edits a regular user's personal
 * routine (`ownerId`), only that user's granted devices.
 */
export function useEditorDevices(ownerId: string | null) {
  const { devices, loading } = useDevices()
  const { grantedIds, loading: grantsLoading } = useGrants(ownerId ?? '', ownerId === null)
  if (ownerId === null) return { devices, loading: loading && devices.length === 0 }
  const granted = new Set(grantedIds ?? [])
  return { devices: devices.filter((d) => granted.has(d.id)), loading: (loading && devices.length === 0) || grantsLoading || !grantedIds }
}
