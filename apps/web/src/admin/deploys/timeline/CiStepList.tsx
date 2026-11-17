import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { CiJob } from '../../data/useDeployStatus'
import { formatDuration } from '../deployLabels'
import { ciStateIcon } from './ciLabels'

/** A job's steps: icon, name and duration, indented under the job. */
export function CiStepList({ steps }: { steps: CiJob['steps'] }) {
  if (steps.length === 0) return null
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, pl: 5.5, pr: 1, pb: 0.75 }}>
      {steps.map((step) => (
        <Box component="li" key={step.number} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
          <Box sx={{ display: 'flex' }}>{ciStateIcon(step.state, 14)}</Box>
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{step.name}</Typography>
          {step.startedAt && step.completedAt && (
            <Typography variant="caption" color="text.secondary">{formatDuration(step.startedAt, step.completedAt)}</Typography>
          )}
        </Box>
      ))}
    </Box>
  )
}
