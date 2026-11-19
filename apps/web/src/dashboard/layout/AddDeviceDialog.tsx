import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Typography from '@mui/material/Typography'
import type { DeviceGroup } from '../lib/devicesToAdd'

type Props = { open: boolean; groups: readonly DeviceGroup[]; onPick: (deviceId: string) => void; onClose: () => void }

/** Picks a device to put on Home, from every room. */
export function AddDeviceDialog({ open, groups, onPick, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="add-device-title">
      <DialogTitle id="add-device-title">Add a device to Home</DialogTitle>
      <DialogContent sx={{ px: 1 }}>
        {groups.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2, pb: 1 }}>
            Every device is already on Home.
          </Typography>
        ) : (
          groups.map((group) => (
            <List key={group.room} dense subheader={<ListSubheader disableSticky>{group.room}</ListSubheader>}>
              {group.devices.map((device) => (
                <ListItemButton key={device.id} onClick={() => onPick(device.id)}>
                  <ListItemText primary={device.name} />
                </ListItemButton>
              ))}
            </List>
          ))
        )}
      </DialogContent>
    </Dialog>
  )
}
