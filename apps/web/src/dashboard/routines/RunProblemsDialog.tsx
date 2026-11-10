import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import { problemText, runLabel } from '../../routines/lib/runLabel'
import type { RoutineRun } from '../../routines/types'

type Props = { name: string; run: RoutineRun; onClose: () => void }

/** What went wrong in a routine's last run. Devices the viewer can't see are only counted. */
export function RunProblemsDialog({ name, run, onClose }: Props) {
  const others = run.hiddenProblems
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {name}: {runLabel(run).text}
      </DialogTitle>
      <DialogContent>
        <List dense disablePadding>
          {run.problems.map((p, i) => (
            <ListItem key={i} disableGutters>
              <ListItemText primary={problemText(p)} />
            </ListItem>
          ))}
          {others > 0 && (
            <ListItem disableGutters>
              <ListItemText primary={others === 1 ? '1 other device' : `${others} other devices`} />
            </ListItem>
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
