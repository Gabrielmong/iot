import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { type WidgetKind, widgetName } from './widgetKinds'

/** Arrange mode only: a widget whose routine, camera or room is gone or not visible, so it can be removed. */
export function UnavailableWidget({ kind }: { kind: WidgetKind }) {
  return (
    <Paper variant="outlined" sx={{ height: '100%', p: 2, borderRadius: '10px', borderStyle: 'dashed', opacity: 0.6 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
        {widgetName(kind)}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Not available
      </Typography>
    </Paper>
  )
}
