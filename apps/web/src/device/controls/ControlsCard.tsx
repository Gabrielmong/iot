import { ErrorSnackbar } from '../../dashboard/ErrorSnackbar'
import type { Device } from '../../dashboard/types'
import { SectionCard } from '../common/SectionCard'
import { usePatchDevice } from '../data/usePatchDevice'
import { DeviceControls } from './DeviceControls'

/** The device's controls wired to optimistic commands, with the dashboard's error snackbar. */
export function ControlsCard({ device }: { device: Device }) {
  const { onPatch, error, clearError } = usePatchDevice(device)
  return (
    <SectionCard title="Controls">
      <DeviceControls device={device} onPatch={onPatch} />
      <ErrorSnackbar message={error} onClose={clearError} />
    </SectionCard>
  )
}
