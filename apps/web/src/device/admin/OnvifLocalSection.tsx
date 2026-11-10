import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useCameraOnvif } from '../data/useCameraOnvif'
import type { DeviceDetail } from '../types'
import { OnvifLocalForm } from './OnvifLocalForm'
import { OnvifLocalStatus } from './OnvifLocalStatus'

const TITLE = 'Local stream (ONVIF)'

/** For Tuya cameras (admins only, inside the admin card): stream locally over ONVIF instead of via the Tuya cloud. */
export function OnvifLocalSection({ device }: { device: Pick<DeviceDetail, 'id' | 'brand' | 'kind' | 'streamSource' | 'ip'> }) {
  const { switchToLocal, switchToCloud } = useCameraOnvif(device.id)
  if (device.brand !== 'TUYA' || device.kind !== 'CAMERA') return null
  return (
    <Box component="section" aria-label={TITLE} sx={{ mt: 3 }}>
      <Typography variant="subtitle2" component="h3" gutterBottom>
        {TITLE}
      </Typography>
      {device.streamSource === 'LOCAL' ? <OnvifLocalStatus switchToCloud={switchToCloud} /> : <OnvifLocalForm ip={device.ip} switchToLocal={switchToLocal} />}
    </Box>
  )
}
