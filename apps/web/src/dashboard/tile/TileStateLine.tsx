import Typography from '@mui/material/Typography'
import type { Device } from '../types'
import { computerStatus } from '../lib/computerStatus'
import { stateLine } from '../lib/stateLine'

/** The tile's state text ("Purple · 70%", "Off", "Offline", a PC's "Waking…", ...). */
export function TileStateLine({ device }: { device: Device }) {
  return (
    <Typography variant="body2" color="text.secondary" noWrap>
      {computerStatus(device) ?? stateLine(device)}
    </Typography>
  )
}
