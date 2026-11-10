import { useCallback, useState } from 'react'
import { DEFAULT_SORT, type DeviceFilters, NO_FILTERS, type Sort, type SortKey } from '../lib/deviceQuery'

/** Search, filters and sort for the admin device table. Clicking the sorted column again reverses it. */
export function useDeviceQueryState() {
  const [filters, setFilters] = useState<DeviceFilters>(NO_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const toggleSort = useCallback(
    (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })),
    [],
  )
  const updateFilters = useCallback((patch: Partial<DeviceFilters>) => setFilters((f) => ({ ...f, ...patch })), [])
  const clearFilters = useCallback(() => setFilters(NO_FILTERS), [])
  return { filters, updateFilters, clearFilters, sort, toggleSort }
}
