import { ConfirmDialog } from '../common/ConfirmDialog'
import type { DeployEvent } from '../data/useDeployStatus'
import { shortSha } from './deployLabels'

type Props = { event: DeployEvent; onConfirm: (sha: string) => Promise<unknown>; onClose: () => void }

export function RollbackDialog({ event, onConfirm, onClose }: Props) {
  const sha = event.sha ?? ''
  return (
    <ConfirmDialog title="Roll back?" confirmLabel="Roll back" onConfirm={() => onConfirm(sha)} onClose={onClose}>
      Roll back to {shortSha(sha)} — {event.message ?? 'no message'}? Auto-deploy will be paused.
    </ConfirmDialog>
  )
}
