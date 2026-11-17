import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { DeployStatus } from '../data/useDeployStatus'
import { DeployActions, type DeployActionHandlers } from './DeployActions'
import { pausedLabel, relativeTime, shortSha } from './deployLabels'
import { ShaChip } from './ShaChip'

type Props = DeployActionHandlers & { status: DeployStatus; restarting: boolean; notBack: boolean; pending: boolean }

function CheckLine({ status }: { status: DeployStatus }) {
  if (status.lastCheckError) return <Typography variant="body2" color="warning.main">{status.lastCheckError}</Typography>
  if (!status.lastCheckAt) return null
  return <Typography variant="body2" color="text.secondary">checked {relativeTime(status.lastCheckAt)}</Typography>
}

function Running({ running }: { running: DeployStatus['running'] }) {
  if (!running) return <Typography variant="subtitle1" component="p">Nothing deployed yet</Typography>
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
      <ShaChip sha={shortSha(running.sha)} />
      <Typography
        variant="subtitle1"
        component="p"
        title={running.message}
        sx={{ minWidth: 0, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {running.message}
      </Typography>
    </Stack>
  )
}

/** What's running, the auto-deploy state, the last GitHub check and the action buttons, in one card. */
export function DeployTopBar({ status, restarting, notBack, ...actions }: Props) {
  const { running } = status
  const paused = pausedLabel(status.pausedReason)
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, borderRadius: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>Running now</Typography>
          <Running running={running} />
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          {running && <Typography variant="body2" color="text.secondary">deployed {relativeTime(running.deployedAt)}</Typography>}
          <Chip size="small" color={status.autoDeploy ? 'success' : 'warning'} label={status.autoDeploy ? 'Auto-deploy on' : paused} />
          <CheckLine status={status} />
          {status.helperUpdateAvailable && <Chip size="small" variant="outlined" label="Helper update available" />}
        </Stack>
        {status.ciError && <Typography variant="body2" color="warning.main">Can't read CI: {status.ciError}</Typography>}
        {restarting && <Alert severity="info">Restarting…</Alert>}
        {notBack && <Alert severity="warning">The app hasn't come back. See 'When the app is down' in docs/RUNNING.md.</Alert>}
        <DeployActions status={status} {...actions} />
      </Stack>
    </Paper>
  )
}
