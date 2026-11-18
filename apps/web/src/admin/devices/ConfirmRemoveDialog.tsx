import { ConfirmDialog } from '../common/ConfirmDialog'
import { useRemoveDevice } from '../data/useDeviceMutations'
import type { AdminDevice } from '../types'

type Props = {
  device: Pick<AdminDevice, 'id' | 'name'>
  outletCount: number
  /** A PC with a HomeAgent: removing it tells the agent to uninstall. */
  hasAgent?: boolean
  onClose: () => void
  /** Called once the device has been removed (before the dialog closes). */
  onRemoved?: () => void
}

/** Confirms removing a device; a parent (power strip) says its outlets go too, a PC that its agent uninstalls. */
export function ConfirmRemoveDialog({ device, outletCount, hasAgent = false, onClose, onRemoved }: Props) {
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
      {hasAgent && <> The agent on the PC will uninstall itself.</>}
    </ConfirmDialog>
  )
}
