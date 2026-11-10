import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
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

const newestFirst = (a: DeployEvent, b: DeployEvent) => Date.parse(b.startedAt) - Date.parse(a.startedAt)

/** Admin deploys: what's running, auto-deploy control, history with logs and rollback. */
export function DeploysPage() {
  const { status, restarting, notBack, error, refetch, noteCommand } = useDeployStatus()
  const [message, setMessage] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<DeployEvent | null>(null)
  const commands = useDeployCommands(noteCommand, setMessage, refetch)

  const events = status ? [...status.events].sort(newestFirst) : []
  const selected = events.find((e) => e.id === pickedId) ?? events.find((e) => e.status === 'RUNNING') ?? events[0] ?? null
  const live = selected?.status === 'RUNNING' || restarting
  const { log, loading } = useDeployLog(selected?.id ?? null, live)

  if (!status) return error ? <QueryError what="deploys" onRetry={refetch} /> : <CircularProgress size={24} />
  if (!status.available) return <PageSection title="Deploys"><HelperUnavailable /></PageSection>

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
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}>
          <DeployEventList
            events={events}
            selectedId={selected?.id ?? null}
            disabled={Boolean(status.busy) || commands.pending}
            onSelect={setPickedId}
            onRollback={setRollbackTarget}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          {selected && <DeployLogPanel log={log} loading={loading} live={live} />}
        </Grid>
      </Grid>
      {rollbackTarget && (
        <RollbackDialog event={rollbackTarget} onConfirm={commands.rollback} onClose={() => setRollbackTarget(null)} />
      )}
      <ErrorSnackbar message={message} onClose={() => setMessage(null)} />
    </PageSection>
  )
}
