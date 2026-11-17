import type { SxProps, Theme } from '@mui/material/styles'
import { useCiJobLog } from '../data/useCiJobLog'
import { DeployLogPanel } from './DeployLogPanel'

/** A finished CI job's log. */
export function JobLog({ jobId, sx }: { jobId: string; sx?: SxProps<Theme> }) {
  const { log, loading } = useCiJobLog(jobId)
  return <DeployLogPanel log={log} loading={loading} live={false} sx={sx} emptyText="No log for this job." ariaLabel="CI log" />
}
