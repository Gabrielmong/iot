import type { SxProps, Theme } from '@mui/material/styles'
import { useDeployLog } from '../data/useDeployLog'
import { DeployLogPanel } from './DeployLogPanel'

/** A deploy history event's log, followed live while it runs. */
export function EventLog({ eventId, live, sx }: { eventId: string; live: boolean; sx?: SxProps<Theme> }) {
  const { log, loading } = useDeployLog(eventId, live)
  return <DeployLogPanel log={log} loading={loading} live={live} sx={sx} />
}
