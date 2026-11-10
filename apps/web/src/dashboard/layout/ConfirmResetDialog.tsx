import { ConfirmDialog } from '../../admin/common/ConfirmDialog'

type Props = { onConfirm: () => Promise<unknown>; onClose: () => void }

/** Asks before throwing away the user's own arrangement of this tab. */
export function ConfirmResetDialog({ onConfirm, onClose }: Props) {
  return (
    <ConfirmDialog title="Reset this tab?" confirmLabel="Reset to default" onConfirm={onConfirm} onClose={onClose}>
      Your own arrangement of this tab will be deleted and the default arrangement will show again.
    </ConfirmDialog>
  )
}
