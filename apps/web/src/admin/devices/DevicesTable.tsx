import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import type { Sort, SortKey } from '../lib/deviceQuery'
import type { AdminDevice } from '../types'
import { DeviceTableRow } from './DeviceTableRow'

type Props = {
  devices: readonly AdminDevice[]
  sort: Sort
  onSort: (key: SortKey) => void
  renderAction: (device: AdminDevice) => ReactNode
  onClearFilters: () => void
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'room', label: 'Room' },
  { key: 'model', label: 'Brand / model' },
  { key: 'ip', label: 'Address' },
  { key: 'health', label: 'Status' },
  { key: 'lastSeen', label: 'Last seen' },
]

/** Adopted devices as a sortable table; an empty result offers to clear the filters. */
export function DevicesTable({ devices, sort, onSort, renderAction, onClearFilters }: Props) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Table aria-label="Your devices" size="small" sx={{ '& td, & th': { borderColor: 'divider' }, '& td': { py: 1 } }}>
        <TableHead>
          <TableRow>
            <TableCell />
            {COLUMNS.map((c) => (
              <TableCell key={c.key} sortDirection={sort.key === c.key ? sort.dir : false} sx={{ color: 'text.secondary', fontWeight: 600 }}>
                <TableSortLabel active={sort.key === c.key} direction={sort.key === c.key ? sort.dir : 'asc'} onClick={() => onSort(c.key)}>
                  {c.label}
                </TableSortLabel>
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((d) => (
            <DeviceTableRow key={d.id} device={d} action={renderAction(d)} />
          ))}
          {devices.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length + 2} align="center" sx={{ py: 4 }}>
                <Typography color="text.secondary">No devices match</Typography>
                <Button onClick={onClearFilters} sx={{ mt: 1 }}>
                  Clear filters
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  )
}
