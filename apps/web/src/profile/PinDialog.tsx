import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { ChangePinSection } from './ChangePinSection'

/** For guests with a PIN: they cannot edit a profile, only change their PIN. */
export function PinDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Your PIN</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <ChangePinSection />
      </DialogContent>
      <DialogActions>
        <Button size="large" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
