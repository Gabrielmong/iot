import { ConfirmDialog } from '../common/ConfirmDialog'
import { useRemoveDevice } from '../data/useDeviceMutations'
import type { AdminDevice } from '../types'

type Props = {
  device: Pick<AdminDevice, 'id' | 'name'>
  outletCount: number
  onClose: () => void
  /** Called once the device has been removed (before the dialog closes). */
  onRemoved?: () => void
}

/** Confirms removing a device; a parent (power strip) says its outlets go too. */
export function ConfirmRemoveDialog({ device, outletCount, onClose, onRemoved }: Props) {
  const remove = useRemoveDevice()
  const confirm = async () => {
    await remove(device.id)
    onRemoved?.()
  }
  return (
    <ConfirmDialog title={`Remove ${device.name}?`} confirmLabel="Remove" onConfirm={confirm} onClose={onClose}>
      {outletCount > 0 ? (
        <>
          Removing {device.name} also removes its {outletCount} {outletCount === 1 ? 'outlet' : 'outlets'}, and anyone
          granted access loses it.
        </>
      ) : (
        <>{device.name} will be removed and anyone granted access loses it. It can be adopted again if it is still on the network.</>
      )}
    </ConfirmDialog>
  )
}
