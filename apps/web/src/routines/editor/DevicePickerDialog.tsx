import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { groupDevicesByRoom } from '../../admin/lib/groupDevicesByRoom'
import type { Device, Room } from '../../dashboard/types'

type Props = { devices: readonly Device[]; rooms: readonly Room[]; onPick: (device: Device) => void; onClose: () => void }

/** Pick one device for a step, grouped by room. `devices` is already filtered to what the step may use. */
export function DevicePickerDialog({ devices, rooms, onPick, onClose }: Props) {
  const titleId = useId()
  const groups = groupDevicesByRoom(devices, rooms)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Pick a device</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
        {groups.length === 0 && <Typography sx={{ px: 3, color: 'text.secondary' }}>Every device is already in this step.</Typography>}
        <List disablePadding>
          {groups.map((g) => (
            <li key={g.roomId ?? 'none'}>
              <ul style={{ padding: 0 }}>
                <ListSubheader>{g.name}</ListSubheader>
                {g.devices.map((d) => (
                  <ListItemButton key={d.id} onClick={() => onPick(d)} aria-label={d.name}>
                    <ListItemText primary={d.name} />
                  </ListItemButton>
                ))}
              </ul>
            </li>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}
