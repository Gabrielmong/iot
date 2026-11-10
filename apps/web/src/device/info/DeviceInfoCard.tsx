import { BRAND_LABELS, KIND_LABELS } from '../../admin/lib/deviceLabels'
import { formatLastSeen } from '../../admin/lib/formatLastSeen'
import { SectionCard } from '../common/SectionCard'
import { connectionLabel } from '../lib/connectionLabel'
import type { DeviceDetail } from '../types'
import { InfoRow } from './InfoRow'

/** Static facts about the device. The address is only present for admins. */
export function DeviceInfoCard({ device }: { device: DeviceDetail }) {
  const brandModel = [BRAND_LABELS[device.brand], device.model].filter(Boolean).join(' ')
  return (
    <SectionCard title="Info" label="Device info">
      <InfoRow label="Brand / model" value={brandModel} />
      <InfoRow label="Type" value={KIND_LABELS[device.kind]} />
      <InfoRow label="Room" value={device.room?.name ?? 'No room'} />
      <InfoRow label="Connection" value={connectionLabel(device)} />
      <InfoRow label="Last seen" value={formatLastSeen(device.lastSeenAt ?? null)} />
      {device.ip && <InfoRow label="Address" value={device.ip} />}
    </SectionCard>
  )
}
