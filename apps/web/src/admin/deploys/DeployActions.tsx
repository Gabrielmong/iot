import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import { useState } from 'react'
import { ConfirmDialog } from '../common/ConfirmDialog'
import type { DeployStatus } from '../data/useDeployStatus'

export type DeployActionHandlers = {
  onDeployNow: () => Promise<unknown>
  onRestart: () => Promise<unknown>
  onPause: () => Promise<unknown>
  onResume: () => Promise<unknown>
}

/** Deploy now, Restart app (confirmed) and Pause/Resume; all disabled while an operation runs. */
export function DeployActions({ status, pending, onDeployNow, onRestart, onPause, onResume }: DeployActionHandlers & { status: DeployStatus; pending: boolean }) {
  const [confirmRestart, setConfirmRestart] = useState(false)
  const busy = Boolean(status.busy) || pending
  return (
    <Tooltip title={status.busy ?? ''}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button variant="contained" size="large" disabled={busy} onClick={() => void onDeployNow()}>Deploy now</Button>
        <Button variant="outlined" size="large" disabled={busy} onClick={() => setConfirmRestart(true)}>Restart app</Button>
        <Button variant="outlined" size="large" disabled={busy} onClick={() => void (status.autoDeploy ? onPause() : onResume())}>
          {status.autoDeploy ? 'Pause auto-deploy' : 'Resume auto-deploy'}
        </Button>
        {confirmRestart && (
          <ConfirmDialog title="Restart app?" confirmLabel="Restart" onConfirm={onRestart} onClose={() => setConfirmRestart(false)}>
            The app will be unavailable for a few seconds.
          </ConfirmDialog>
        )}
      </Stack>
    </Tooltip>
  )
}
