import Typography from '@mui/material/Typography'
import { ControlledCamera } from '../camera-controls/ControlledCamera'
import { SectionCard } from '../common/SectionCard'
import type { DeviceDetail } from '../types'

export const CLOUD_STREAM_NOTE = "Cloud-streamed: won't play when the internet is down."

/** The camera's live player; cloud cameras carry a note that they need the internet. */
export function CameraPreview({ device }: { device: Pick<DeviceDetail, 'id' | 'connection'> & Partial<Pick<DeviceDetail, 'brand'>> }) {
  const cloud = device.connection === 'CLOUD'
  return (
    <SectionCard title="Live view">
      <ControlledCamera deviceId={device.id} brand={device.brand} cloud={cloud} />
      {cloud && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {CLOUD_STREAM_NOTE}
        </Typography>
      )}
    </SectionCard>
  )
}
