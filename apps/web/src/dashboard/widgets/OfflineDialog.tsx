import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { Link } from 'react-router'
import type { Device } from '../types'

type Props = { open: boolean; devices: readonly Device[]; onClose: () => void }

/** The devices that aren't responding, each opening its device page. */
export function OfflineDialog({ open, devices, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="offline-title">
      <DialogTitle id="offline-title">Devices offline</DialogTitle>
      <DialogContent sx={{ px: 1 }}>
        <List dense>
          {devices.map((device) => (
            <ListItemButton key={device.id} component={Link} to={`/devices/${device.id}`}>
              <ListItemText primary={device.name} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
