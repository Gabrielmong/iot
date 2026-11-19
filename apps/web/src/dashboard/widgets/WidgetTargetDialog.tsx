import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { noTargets, targetOptions, targetTitle, type TargetKind } from './lib/widgetTargets'
import type { WidgetData } from './useWidgetData'

type Props = { kind: TargetKind | null; data: WidgetData; onPick: (targetId: string) => void; onClose: () => void }

/** Asks which routine, camera or room a new widget shows. Open while `kind` is set. */
export function WidgetTargetDialog({ kind, data, onPick, onClose }: Props) {
  const options = kind ? targetOptions(kind, data) : []
  return (
    <Dialog open={kind !== null} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="widget-target-title">
      <DialogTitle id="widget-target-title">{kind && targetTitle(kind)}</DialogTitle>
      <DialogContent sx={{ px: 1 }}>
        {kind && options.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2 }}>
            {noTargets(kind)}
          </Typography>
        ) : (
          <List dense>
            {options.map((option) => (
              <ListItemButton key={option.id} onClick={() => onPick(option.id)}>
                <ListItemText primary={option.name} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}
