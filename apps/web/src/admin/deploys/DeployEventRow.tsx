import Box from '@mui/material/Box'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import Typography from '@mui/material/Typography'
import type { DeployEvent } from '../data/useDeployStatus'
import { RollbackButton } from './RollbackButton'
import { eventTitle, metaLine, showsRollback, statusIcon } from './deployLabels'

type Props = {
  event: DeployEvent
  selected: boolean
  /** Disables the rollback button (an operation is running). */
  disabled: boolean
  onSelect: () => void
  onRollback: () => void
}

/** Room kept at the end of the details line for the rollback button. */
const ROLLBACK_ROOM = 136

/**
 * One history entry: status icon, title and commit message on one line, the details underneath,
 * and a rollback action at the end of the details line where allowed.
 */
export function DeployEventRow({ event, selected, disabled, onSelect, onRollback }: Props) {
  const showRollback = showsRollback(event)
  return (
    <ListItem disablePadding divider sx={{ position: 'relative', display: 'block' }}>
      <ListItemButton
        selected={selected}
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        sx={{
          alignItems: 'flex-start',
          gap: 1.5,
          py: 1.25,
          '&.Mui-selected, &.Mui-selected:hover': {
            bgcolor: 'action.hover',
            boxShadow: (t) => `inset 3px 0 0 ${t.palette.primary.main}`,
          },
        }}
      >
        <Box sx={{ display: 'flex', mt: '2px' }}>{statusIcon(event.status)}</Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap title={event.message ?? undefined}>
            <Box component="span" sx={{ fontWeight: 600 }}>{eventTitle(event)}</Box>
            {event.message && (
              <Box component="span" sx={{ color: 'text.secondary' }}>{` — ${event.message}`}</Box>
            )}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={[{ mt: 0.25 }, showRollback && { pr: `${ROLLBACK_ROOM}px`, minHeight: 30, display: 'flex', alignItems: 'center' }]}
          >
            {metaLine(event)}
          </Typography>
        </Box>
      </ListItemButton>
      {showRollback && (
        <RollbackButton event={event} disabled={disabled} onClick={onRollback} sx={{ position: 'absolute', right: 8, bottom: 6 }} />
      )}
    </ListItem>
  )
}
