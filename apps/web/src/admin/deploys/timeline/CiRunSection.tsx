import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { CiRun } from '../../data/useDeployStatus'
import { formatDuration } from '../deployLabels'
import { ciStateIcon, isUnfinished } from './ciLabels'
import { CiJobRow } from './CiJobRow'
import { isSelected, type Selection } from './selection'

type Props = { run: CiRun; selection: Selection | null; onSelect: (s: Selection) => void }

/** One workflow run: a header that folds its jobs away, open by default while unfinished or failed. */
export function CiRunSection({ run, selection, onSelect }: Props) {
  const [choice, setChoice] = useState<boolean | null>(null)
  const expanded = choice ?? (isUnfinished(run.state) || run.state === 'FAILED')
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <ButtonBase
          aria-expanded={expanded}
          onClick={() => setChoice(!expanded)}
          sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1, px: 1, py: 0.75, borderRadius: 1, textAlign: 'left' }}
        >
          <Box sx={{ display: 'flex' }}>{ciStateIcon(run.state)}</Box>
          <Typography sx={{ fontWeight: 600 }}>{run.workflow}</Typography>
          {run.attempt > 1 && <Typography variant="body2" color="text.secondary">attempt {run.attempt}</Typography>}
          {!isUnfinished(run.state) && (
            <Typography variant="body2" color="text.secondary">{formatDuration(run.createdAt, run.updatedAt)}</Typography>
          )}
          {!run.gatesDeploy && <Typography variant="body2" color="text.secondary">doesn't block deploy</Typography>}
          <ExpandMoreIcon fontSize="small" sx={{ ml: 'auto', color: 'text.secondary', transform: expanded ? 'rotate(180deg)' : undefined }} />
        </ButtonBase>
        <Link href={run.url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ flexShrink: 0 }}>
          Open in GitHub
        </Link>
      </Box>
      {expanded && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {run.jobs.map((job) => (
            <CiJobRow
              key={job.id}
              job={job}
              selected={isSelected(selection, 'job', job.id)}
              onSelect={() => onSelect({ kind: 'job', id: job.id })}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
