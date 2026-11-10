import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import type { ReactNode } from 'react'
import { SelectField } from '../../common/SelectField'
import type { DeviceFilters } from '../lib/deviceQuery'
import { HEALTH_LABEL, type DeviceHealth } from '../lib/deviceStatus'
import { KIND_LABELS } from '../lib/deviceLabels'
import type { Room } from '../types'
import { HealthCounts } from './HealthCounts'

type Props = {
  filters: DeviceFilters
  onFilters: (patch: Partial<DeviceFilters>) => void
  rooms: readonly Room[]
  counts: Record<DeviceHealth, number>
  actions?: ReactNode
}

const KIND_OPTIONS = [{ value: 'any', label: 'Any type' }, ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))]
const HEALTH_OPTIONS = [{ value: 'any', label: 'Any status' }, ...Object.entries(HEALTH_LABEL).map(([value, label]) => ({ value, label }))]

/** Search, Room / Type / Status filters, the problem counts and page actions. */
export function DevicesToolbar({ filters, onFilters, rooms, counts, actions }: Props) {
  const roomOptions = [
    { value: 'any', label: 'Any room' },
    ...rooms.map((r) => ({ value: r.id, label: r.name })),
    { value: 'none', label: 'No room' },
  ]
  return (
    <Box sx={{ display: 'grid', gap: 1.5, mb: 3 }}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr' } }}>
        <TextField
          label="Search devices"
          value={filters.search}
          onChange={(e) => onFilters({ search: e.target.value })}
          sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <SelectField label="Room" value={filters.room} options={roomOptions} onChange={(room) => onFilters({ room })} />
        <SelectField label="Type" value={filters.kind} options={KIND_OPTIONS} onChange={(kind) => onFilters({ kind: kind as DeviceFilters['kind'] })} />
        <SelectField
          label="Status"
          value={filters.health}
          options={HEALTH_OPTIONS}
          onChange={(health) => onFilters({ health: health as DeviceFilters['health'] })}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <HealthCounts counts={counts} active={filters.health} onPick={(health) => onFilters({ health })} />
        {actions}
      </Box>
    </Box>
  )
}
