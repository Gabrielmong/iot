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
import { useDeployLog } from './data/useDeployLog'
import { type DeployEvent, useDeployStatus } from './data/useDeployStatus'
import { DeployEventList } from './deploys/DeployEventList'
import { DeployLogPanel } from './deploys/DeployLogPanel'
import { DeployTopBar } from './deploys/DeployTopBar'
import { HelperUnavailable } from './deploys/HelperUnavailable'
import { RollbackDialog } from './deploys/RollbackDialog'
import { useLogSelection } from './deploys/useLogSelection'

const newestFirst = (a: DeployEvent, b: DeployEvent) => Date.parse(b.startedAt) - Date.parse(a.startedAt)

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

  const events = status ? [...status.events].sort(newestFirst) : []
  const { selected, select } = useLogSelection(events, phone)
  const live = selected?.status === 'RUNNING' || restarting
  const { log, loading } = useDeployLog(selected?.id ?? null, live)

  if (!status) return error ? <QueryError what="deploys" onRetry={refetch} /> : <CircularProgress size={24} />
  if (!status.available) return <PageSection title="Deploys"><HelperUnavailable /></PageSection>

  const logPanel = selected && (
    <DeployLogPanel key={selected.id} log={log} loading={loading} live={live} sx={phone ? INLINE_LOG_SX : SIDE_LOG_SX} />
  )

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
        <DeployEventList
          events={events}
          selectedId={selected?.id ?? null}
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
