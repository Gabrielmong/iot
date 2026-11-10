import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ErrorSnackbar } from '../../dashboard/ErrorSnackbar'
import { stateLine } from '../../dashboard/lib/stateLine'
import { useWaking } from '../../dashboard/tile/useWaking'
import { SectionCard } from '../common/SectionCard'
import { usePatchDevice } from '../data/usePatchDevice'
import type { DeviceDetail } from '../types'
import { WakeSetupChecklist } from './WakeSetupChecklist'

/** A computer: Online / Offline (when it has an IP), a big Wake button, and the setup checklist for admins. */
export function ComputerCard({ device, isAdmin }: { device: DeviceDetail; isAdmin: boolean }) {
  const { onPatch, error, clearError } = usePatchDevice(device)
  const [waking, startWaking] = useWaking()
  const status = waking ? 'Waking…' : stateLine(device)
  const wake = () => {
    startWaking()
    onPatch({ on: true })
  }
  return (
    <SectionCard title="Computer">
      <Stack spacing={2}>
        {status && <Typography color="text.secondary">{status}</Typography>}
        <Button variant="contained" size="large" startIcon={<PowerSettingsNewIcon />} onClick={wake} sx={{ minHeight: 56, borderRadius: '14px' }}>
          Wake
        </Button>
        {isAdmin && <WakeSetupChecklist />}
      </Stack>
      <ErrorSnackbar message={error} onClose={clearError} />
    </SectionCard>
  )
}
