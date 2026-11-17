import type { SxProps, Theme } from '@mui/material/styles'
import { CiJobPending } from './CiJobPending'
import { EventLog } from './EventLog'
import { JobLog } from './JobLog'
import { isUnfinished } from './timeline/ciLabels'
import type { SelectionTarget } from './timeline/selectionTargets'

type Props = { target: SelectionTarget; restarting: boolean; sx?: SxProps<Theme> }

/** The panel for what's selected: an event's log, a finished job's log, or a note while the job runs. */
export function SelectedLog({ target, restarting, sx }: Props) {
  if (target.kind === 'event') {
    const live = target.event.status === 'RUNNING' || restarting
    return <EventLog key={`event:${target.event.id}`} eventId={target.event.id} live={live} sx={sx} />
  }
  if (isUnfinished(target.job.state)) return <CiJobPending job={target.job} sx={sx} />
  return <JobLog key={`job:${target.job.id}`} jobId={target.job.id} sx={sx} />
}
