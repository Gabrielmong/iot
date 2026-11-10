import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { runLabel } from '../lib/runLabel'
import { clockTime, stepProgress, stepStates } from '../lib/runProgress'
import type { Routine } from '../types'
import { StepDetail } from './StepDetail'
import { useNow } from './useNow'

type Props = { routine: Routine; deviceNames: ReadonlyMap<string, string>; onStop: () => void; onClose: () => void }

const plural = (n: number, word: string) => `${n} other ${word}${n === 1 ? '' : 's'}`

/** Every step of a routine: while it runs, which are done, which is in progress and which is next. */
export function RunDetailsDialog({ routine, deviceNames, onStop, onClose }: Props) {
  const titleId = useId()
  const run = routine.lastRun
  const running = run?.status === 'RUNNING'
  const now = useNow(1000, running)
  const states = stepStates(routine.steps.length, run)
  const progress = stepProgress(routine.steps, run, now)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{routine.name}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {runSummary(run)}
        </Typography>
        {progress && <LinearProgress variant="determinate" value={progress.fraction * 100} sx={{ mb: 2 }} aria-label="Progress" />}
        <Typography component="ol" sx={{ m: 0, p: 0 }}>
          {routine.steps.map((step, i) => (
            <StepDetail key={i} index={i} step={step} state={states[i]!} run={run} deviceNames={deviceNames} now={now} />
          ))}
        </Typography>
        {run && run.hiddenProblems > 0 && (
          <Typography variant="body2" sx={{ color: 'warning.main', mt: 1 }}>
            {plural(run.hiddenProblems, 'device')} had problems
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {running && (
          <Button color="error" onClick={onStop}>
            Stop
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

/** "Started 20:03 by Ann", or for a finished run "Last run 20:03 by the schedule · Done". */
function runSummary(run: Routine['lastRun']): string {
  if (!run) return 'Not run yet'
  const who = run.startedBy ? `by ${run.startedBy}` : 'by the schedule'
  if (run.status === 'RUNNING') return `Started ${clockTime(run.startedAt)} ${who}`
  return `Last run ${clockTime(run.startedAt)} ${who} · ${runLabel(run).text}`
}
