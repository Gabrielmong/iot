import Box from '@mui/material/Box'
import ListItemButton from '@mui/material/ListItemButton'
import Typography from '@mui/material/Typography'
import type { CiJob } from '../../data/useDeployStatus'
import { formatDuration } from '../deployLabels'
import { ciStateIcon } from './ciLabels'
import { CiStepList } from './CiStepList'
import { selectableSx } from './selectableSx'

type Props = { job: CiJob; selected: boolean; onSelect: () => void }

/** A job line that opens the job's log, with its steps underneath. */
export function CiJobRow({ job, selected, onSelect }: Props) {
  return (
    <Box component="li">
      <ListItemButton
        selected={selected}
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        sx={[{ gap: 1, py: 0.5, pl: 3 }, selectableSx]}
      >
        <Box sx={{ display: 'flex' }}>{ciStateIcon(job.state, 18)}</Box>
        <Typography noWrap sx={{ flex: 1, minWidth: 0 }}>{job.name}</Typography>
        {job.startedAt && job.completedAt && (
          <Typography variant="body2" color="text.secondary">{formatDuration(job.startedAt, job.completedAt)}</Typography>
        )}
      </ListItemButton>
      <CiStepList steps={job.steps} />
    </Box>
  )
}
