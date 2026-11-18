import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ErrorSnackbar } from '../../../dashboard/ErrorSnackbar'
import type { PcPowerAction } from '../../../gql/graphql'
import type { DeviceDetail } from '../../types'
import { ConfirmPowerDialog } from './ConfirmPowerDialog'
import { POWER_ACTIONS, POWER_LABEL } from './powerLabels'
import { powerStateText } from './powerStateText'
import { usePcPower } from './usePcPower'

/** Sleep · Shut down · Restart, for someone with the Power permission while the PC's agent is connected. */
export function PowerActions({ device }: { device: Pick<DeviceDetail, 'id' | 'name' | 'computer'> }) {
  if (!device.computer?.canPower || !device.computer.agent?.connected) return null
  return <Actions deviceId={device.id} deviceName={device.name} />
}

function Actions({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const { state, start, cancel } = usePcPower(deviceId)
  const [asking, setAsking] = useState<PcPowerAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const counting = state?.phase === 'COUNTDOWN'
  const onCancel = () => cancel(state!.id).catch((e: Error) => setError(e.message))
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        {POWER_ACTIONS.map((action) => (
          <Button key={action} variant="outlined" onClick={() => setAsking(action)}>
            {POWER_LABEL[action]}
          </Button>
        ))}
      </Stack>
      {state && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography color="text.secondary" role="status">
            {powerStateText(state)}
          </Typography>
          {counting && (
            <Button size="small" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      )}
      {asking && (
        <ConfirmPowerDialog action={asking} deviceName={deviceName} onConfirm={() => start(asking)} onClose={() => setAsking(null)} />
      )}
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Stack>
  )
}
