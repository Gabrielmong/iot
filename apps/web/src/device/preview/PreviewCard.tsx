import Typography from '@mui/material/Typography'
import { isDeviceOn } from '../../dashboard/lib/isDeviceOn'
import { stateLine } from '../../dashboard/lib/stateLine'
import type { Device } from '../../dashboard/types'
import { SectionCard } from '../common/SectionCard'
import { LightPreview } from './LightPreview'
import { PlugPreview } from './PlugPreview'

/** The live preview (a glowing light, or an on/off plug) with the tile's state line under it. */
export function PreviewCard({ device }: { device: Device }) {
  return (
    <SectionCard title="Live preview">
      {device.kind === 'LIGHT' ? <LightPreview state={device.state} /> : <PlugPreview on={isDeviceOn(device.state)} />}
      <Typography align="center" color="text.secondary">
        {stateLine(device)}
      </Typography>
    </SectionCard>
  )
}
