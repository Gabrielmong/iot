import Chip from '@mui/material/Chip'
import { deviceHealth, HEALTH_COLOR, healthLabel } from '../lib/deviceStatus'
import type { AdminDevice } from '../types'

/** Online (green), Needs setup / Needs pairing (amber) or Offline (red). */
export function HealthChip({ device }: { device: Pick<AdminDevice, 'status' | 'online'> }) {
  return <Chip size="small" variant="outlined" color={HEALTH_COLOR[deviceHealth(device)]} label={healthLabel(device)} />
}
