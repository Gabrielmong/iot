import { useNavigate } from 'react-router'
import { useAdminDevices } from '../../admin/data/useAdminDevices'
import { ConfirmRemoveDialog } from '../../admin/devices/ConfirmRemoveDialog'
import type { DeviceDetail } from '../types'

type Props = { device: Pick<DeviceDetail, 'id' | 'name' | 'computer'>; onClose: () => void }

/** Confirms removal (counting a power strip's outlets for the warning), then returns to the dashboard. */
export function RemoveDeviceDialog({ device, onClose }: Props) {
  const navigate = useNavigate()
  const { devices } = useAdminDevices()
  const outletCount = devices.filter((d) => d.parentId === device.id).length
  return (
    <ConfirmRemoveDialog
      device={device}
      outletCount={outletCount}
      hasAgent={Boolean(device.computer?.agent)}
      onClose={onClose}
      onRemoved={() => void navigate('/')}
    />
  )
}
