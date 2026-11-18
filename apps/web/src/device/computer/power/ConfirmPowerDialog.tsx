import type { PcPowerAction } from '../../../gql/graphql'
import { ConfirmDialog } from '../../../admin/common/ConfirmDialog'
import { POWER_LABEL } from './powerLabels'

const QUESTION: Record<PcPowerAction, (name: string) => string> = {
  SLEEP: (name) => `Put ${name} to sleep?`,
  SHUTDOWN: (name) => `Shut down ${name}?`,
  RESTART: (name) => `Restart ${name}?`,
}

type Props = { action: PcPowerAction; deviceName: string; onConfirm: () => Promise<unknown>; onClose: () => void }

/** Asks before a power action: whoever is at the PC gets a cancellable warning first. */
export function ConfirmPowerDialog({ action, deviceName, onConfirm, onClose }: Props) {
  return (
    <ConfirmDialog title={QUESTION[action](deviceName)} confirmLabel={POWER_LABEL[action]} onConfirm={onConfirm} onClose={onClose}>
      Anyone using it gets a 60 s warning.
    </ConfirmDialog>
  )
}
