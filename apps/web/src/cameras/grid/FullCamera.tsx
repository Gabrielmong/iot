import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useId } from 'react'
import type { Device } from '../../dashboard/types'
import { ControlledCamera } from '../../device/camera-controls/ControlledCamera'

type Props = { device: Device; onClose: () => void; container?: HTMLElement | null }

/**
 * One camera at full quality, over the grid (whose tiles stop while this is open). `container`: where to
 * mount it, so it shows while the grid is in browser full screen (outside it would be invisible).
 */
export function FullCamera({ device, onClose, container }: Props) {
  const titleId = useId()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={phone} aria-labelledby={titleId} container={container ?? undefined}>
      <DialogTitle id={titleId}>{device.name}</DialogTitle>
      <DialogContent>
        <ControlledCamera deviceId={device.id} brand={device.brand} cloud={device.connection === 'CLOUD'} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
