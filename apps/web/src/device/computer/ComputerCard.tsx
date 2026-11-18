import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRef, useState } from 'react'
import { ErrorSnackbar } from '../../dashboard/ErrorSnackbar'
import { computerStatus } from '../../dashboard/lib/computerStatus'
import { stateLine } from '../../dashboard/lib/stateLine'
import { SectionCard } from '../common/SectionCard'
import { usePatchDevice } from '../data/usePatchDevice'
import type { DeviceDetail } from '../types'
import { PowerActions } from './power/PowerActions'
import { RemoteDesktopButton } from './RemoteDesktopButton'
import { WakeSetupChecklist } from './WakeSetupChecklist'

/** A computer: its status (with the server's wake progress), Wake, Remote Desktop, power actions (with an agent) and the setup checklist for admins. */
export function ComputerCard({ device, isAdmin }: { device: DeviceDetail; isAdmin: boolean }) {
  const { onPatch, error, clearError } = usePatchDevice(device)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const checklist = useRef<HTMLDivElement>(null)
  const status = computerStatus(device) ?? stateLine(device)
  const failed = device.computer?.wake?.status === 'FAILED'
  const wake = () => onPatch({ on: true })
  const showChecklist = () => {
    setChecklistOpen(true)
    checklist.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }
  return (
    <SectionCard title="Computer">
      <Stack spacing={2}>
        {status && <Typography color="text.secondary">{status}</Typography>}
        {failed && isAdmin && (
          <Button size="small" onClick={showChecklist} sx={{ alignSelf: 'flex-start' }}>
            Check the setup checklist
          </Button>
        )}
        <Button variant="contained" size="large" startIcon={<PowerSettingsNewIcon />} onClick={wake} sx={{ minHeight: 56, borderRadius: '14px' }}>
          Wake
        </Button>
        <RemoteDesktopButton device={device} onWake={wake} />
        <PowerActions device={device} />
        {isAdmin && (
          <Stack ref={checklist} spacing={1}>
            <WakeSetupChecklist open={checklistOpen} onToggle={() => setChecklistOpen((o) => !o)} />
          </Stack>
        )}
      </Stack>
      <ErrorSnackbar message={error} onClose={clearError} />
    </SectionCard>
  )
}
