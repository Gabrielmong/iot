import { RenameMoveDialog } from '../../admin/devices/RenameMoveDialog'
import { SetKeyDialog } from '../../admin/devices/SetKeyDialog'
import { useRooms } from '../../dashboard/data/useRooms'
import type { DeviceDetail } from '../types'
import { ChangeKindDialog } from './ChangeKindDialog'
import { DeviceAccessDialog } from './DeviceAccessDialog'
import { RemoveDeviceDialog } from './RemoveDeviceDialog'

export type AdminDialog = 'edit' | 'kind' | 'key' | 'access' | 'remove' | null

type Props = { dialog: AdminDialog; device: DeviceDetail; onClose: () => void }

/** Renders whichever admin dialog is open for this device. */
export function DeviceAdminDialogs({ dialog, device, onClose }: Props) {
  const rooms = useRooms()
  switch (dialog) {
    case 'edit':
      return <RenameMoveDialog device={device} rooms={rooms} onClose={onClose} />
    case 'kind':
      return <ChangeKindDialog device={device} onClose={onClose} />
    case 'key':
      return <SetKeyDialog device={device} onClose={onClose} />
    case 'access':
      return <DeviceAccessDialog device={device} onClose={onClose} />
    case 'remove':
      return <RemoveDeviceDialog device={device} onClose={onClose} />
    default:
      return null
  }
}
