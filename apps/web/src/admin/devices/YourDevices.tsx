import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { ReactNode } from 'react'
import type { Sort, SortKey } from '../lib/deviceQuery'
import type { AdminDevice } from '../types'
import { DeviceCompactList } from './DeviceCompactList'
import { DevicesTable } from './DevicesTable'

type Props = {
  devices: readonly AdminDevice[]
  sort: Sort
  onSort: (key: SortKey) => void
  renderAction: (device: AdminDevice) => ReactNode
  onClearFilters: () => void
}

/** The adopted devices: a sortable table, or compact rows on a phone. */
export function YourDevices({ devices, sort, onSort, renderAction, onClearFilters }: Props) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  return phone ? (
    <DeviceCompactList devices={devices} renderAction={renderAction} onClearFilters={onClearFilters} />
  ) : (
    <DevicesTable devices={devices} sort={sort} onSort={onSort} renderAction={renderAction} onClearFilters={onClearFilters} />
  )
}
