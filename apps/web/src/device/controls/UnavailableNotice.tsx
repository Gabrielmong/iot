import Alert from '@mui/material/Alert'
import { needsSetup } from '../../dashboard/lib/capabilities'
import type { Device } from '../../dashboard/types'

/** Explains why a device's controls are disabled (offline or not set up). */
export function UnavailableNotice({ device }: { device: Device }) {
  const reason = needsSetup(device) ? 'Needs setup' : 'Offline'
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      {reason}: controls are unavailable.
    </Alert>
  )
}
