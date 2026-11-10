import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { alpha } from '@mui/material/styles'
import { Link as RouterLink, useLocation } from 'react-router'
import { useDevices } from '../../dashboard/data/useDevices'
import { useRooms } from '../../dashboard/data/useRooms'
import { roomSummaries } from '../../dashboard/lib/roomSummaries'
import { ALL_TAB } from '../../dashboard/lib/roomTabs'
import { palette } from '../../theme/tokens'

/** Desktop: the rooms with something to show, indented under Dashboard (which itself shows all devices). */
export function NavRooms() {
  const { pathname } = useLocation()
  const { devices } = useDevices()
  const rooms = roomSummaries(devices, useRooms()).filter((r) => r.id !== ALL_TAB)
  if (rooms.length === 0) return null
  return (
    <List disablePadding aria-label="Rooms" sx={{ mb: 0.5 }}>
      {rooms.map((room) => {
        const to = `/rooms/${room.id}`
        const active = pathname === to
        return (
          <ListItemButton
            key={room.id}
            component={RouterLink}
            to={to}
            selected={active}
            aria-current={active ? 'page' : undefined}
            sx={{
              minHeight: 36,
              mx: 1,
              mb: 0.25,
              pl: 6.5,
              borderRadius: 2,
              color: active ? 'primary.main' : 'text.secondary',
              '&.Mui-selected, &.Mui-selected:hover': { bgcolor: alpha(palette.lamp, 0.1) },
              '&:hover': { color: active ? 'primary.main' : 'text.primary' },
            }}
          >
            <ListItemText primary={room.name} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, fontWeight: active ? 600 : 500 } } }} />
          </ListItemButton>
        )
      })}
    </List>
  )
}
