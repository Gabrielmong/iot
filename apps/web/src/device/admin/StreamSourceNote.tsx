import Typography from '@mui/material/Typography'
import type { DeviceDetail } from '../types'

/** Swann cameras always stream from the local recorder: shown as read-only text, never a control. */
export function StreamSourceNote({ device }: { device: Pick<DeviceDetail, 'brand' | 'kind'> }) {
  if (device.brand !== 'SWANN' || device.kind !== 'CAMERA') return null
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      Stream source: Local
    </Typography>
  )
}
