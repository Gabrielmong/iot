import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useState } from 'react'
import { ErrorSnackbar } from '../dashboard/ErrorSnackbar'
import { PageSection } from './common/PageSection'
import { QueryError } from './common/QueryError'
import { useDeployCommands } from './data/useDeployCommands'
import { type DeployEvent, useDeployStatus } from './data/useDeployStatus'
import { DeployTopBar } from './deploys/DeployTopBar'
import { HelperUnavailable } from './deploys/HelperUnavailable'
import { RollbackDialog } from './deploys/RollbackDialog'
import { SelectedLog } from './deploys/SelectedLog'
import { buildTimeline } from './deploys/timeline/buildTimeline'
import { DeployTimeline } from './deploys/timeline/DeployTimeline'
import { findTarget } from './deploys/timeline/selectionTargets'
import { useLogSelection } from './deploys/useLogSelection'

/** Log height beside the list: the viewport minus the page chrome, never tiny. */
const SIDE_LOG_SX = { position: 'sticky', top: 16, height: 'max(320px, calc(100dvh - 160px))' } as const
const INLINE_LOG_SX = { height: 'min(60dvh, 480px)' } as const

/** Admin deploys: what's running, auto-deploy control, history with logs and rollback. */
export function DeploysPage() {
  const { status, restarting, notBack, error, refetch, noteCommand } = useDeployStatus()
  const [message, setMessage] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<DeployEvent | null>(null)
  const commands = useDeployCommands(noteCommand, setMessage, refetch)
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('md'))

  const entries = status
    ? buildTimeline({ commits: status.commits, events: status.events, runningSha: status.running?.sha ?? null })
    : []
  const { selected, select } = useLogSelection(entries, phone)
  const target = findTarget(entries, selected)

  if (!status) return error ? <QueryError what="deploys" onRetry={refetch} /> : <CircularProgress size={24} />
  if (!status.available) return <PageSection title="Deploys"><HelperUnavailable /></PageSection>

  const logPanel = target && <SelectedLog target={target} restarting={restarting} sx={phone ? INLINE_LOG_SX : SIDE_LOG_SX} />

  return (
    <PageSection title="Deploys">
      {error && <Alert severity="warning" sx={{ mb: 2 }}>Couldn't reach the server.</Alert>}
      <DeployTopBar
        status={status}
        restarting={restarting}
        notBack={notBack}
        pending={commands.pending}
        onDeployNow={commands.deployNow}
        onRestart={commands.restartApp}
        onPause={commands.pause}
        onResume={commands.resume}
      />
      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' } }}>
        <DeployTimeline
          entries={entries}
          selection={selected}
          paused={!status.autoDeploy}
          disabled={Boolean(status.busy) || commands.pending}
          onSelect={select}
          onRollback={setRollbackTarget}
          selectedLog={phone ? logPanel : undefined}
        />
        {!phone && logPanel}
      </Box>
      {rollbackTarget && (
        <RollbackDialog event={rollbackTarget} onConfirm={commands.rollback} onClose={() => setRollbackTarget(null)} />
      )}
      <ErrorSnackbar message={message} onClose={() => setMessage(null)} />
    </PageSection>
  )
}
