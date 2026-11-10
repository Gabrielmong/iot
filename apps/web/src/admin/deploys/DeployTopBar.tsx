import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { DeployStatus } from '../data/useDeployStatus'
import { DeployActions, type DeployActionHandlers } from './DeployActions'
import { pausedLabel, relativeTime, shortSha } from './deployLabels'

type Props = DeployActionHandlers & { status: DeployStatus; restarting: boolean; notBack: boolean; pending: boolean }

function CheckLine({ status }: { status: DeployStatus }) {
  if (status.lastCheckError) return <Typography variant="body2" color="warning.main">{status.lastCheckError}</Typography>
  if (!status.lastCheckAt) return null
  return <Typography variant="body2" color="text.secondary">checked {relativeTime(status.lastCheckAt)}</Typography>
}

/** What's running, the auto-deploy state, the last GitHub check and the action buttons. */
export function DeployTopBar({ status, restarting, notBack, ...actions }: Props) {
  const { running } = status
  const paused = pausedLabel(status.pausedReason)
  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      <Typography variant="subtitle1" component="p">
        {running ? <><b>{shortSha(running.sha)}</b> · {running.message}</> : 'Nothing deployed yet'}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {running && <Typography variant="body2" color="text.secondary">deployed {relativeTime(running.deployedAt)}</Typography>}
        <Chip size="small" color={status.autoDeploy ? 'success' : 'warning'} label={status.autoDeploy ? 'Auto-deploy on' : paused} />
        <CheckLine status={status} />
        {status.helperUpdateAvailable && <Chip size="small" variant="outlined" label="Helper update available" />}
      </Stack>
      {restarting && <Alert severity="info">Restarting…</Alert>}
      {notBack && <Alert severity="warning">The app hasn't come back. See 'When the app is down' in docs/RUNNING.md.</Alert>}
      <DeployActions status={status} {...actions} />
    </Stack>
  )
}
