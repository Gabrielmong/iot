import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { useId } from 'react'

type Routine = { id: string; name: string }
type Props = { routines: readonly Routine[]; onPick: (routine: Routine) => void; onClose: () => void }

/** Pick the routine a step runs. `routines` is already filtered to what this routine may call. */
export function RoutinePickerDialog({ routines, onPick, onClose }: Props) {
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Pick a routine</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
        {routines.length === 0 && <Typography sx={{ px: 3, color: 'text.secondary' }}>No other routines to run</Typography>}
        <List disablePadding>
          {routines.map((r) => (
            <ListItemButton key={r.id} onClick={() => onPick(r)} aria-label={r.name}>
              <ListItemText primary={r.name} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}
