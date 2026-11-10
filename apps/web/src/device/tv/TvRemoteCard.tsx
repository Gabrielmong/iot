import Stack from '@mui/material/Stack'
import { ErrorSnackbar } from '../../dashboard/ErrorSnackbar'
import { isDeviceOn } from '../../dashboard/lib/isDeviceOn'
import { SectionCard } from '../common/SectionCard'
import { usePatchDevice } from '../data/usePatchDevice'
import type { DeviceDetail } from '../types'
import { AppShortcuts } from './AppShortcuts'
import { DirectionPad } from './DirectionPad'
import { PowerButton } from './PowerButton'
import { useTvCommands } from './useTvCommands'
import { VolumeButtons } from './VolumeButtons'

/** The TV remote: power and volume, the direction pad with Back and Home, then app shortcuts. */
export function TvRemoteCard({ device }: { device: DeviceDetail }) {
  const { sendKey, launchApp, error, clearError } = useTvCommands(device)
  const power = usePatchDevice(device)
  return (
    <SectionCard title="Remote">
      <Stack spacing={3} sx={{ alignItems: 'stretch' }}>
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 2 }}>
          <PowerButton on={isDeviceOn(device.state)} canPowerOn={device.tv?.canPowerOn ?? false} onChange={(on) => power.onPatch({ on })} />
          <VolumeButtons onKey={sendKey} />
        </Stack>
        <DirectionPad onKey={sendKey} />
        <AppShortcuts apps={device.tv?.apps ?? []} onLaunch={launchApp} />
      </Stack>
      <ErrorSnackbar message={error ?? power.error} onClose={() => (clearError(), power.clearError())} />
    </SectionCard>
  )
}
