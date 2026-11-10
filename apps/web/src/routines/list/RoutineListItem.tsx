import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { Link as RouterLink } from 'react-router'
import { runLabel } from '../lib/runLabel'
import { currentStepLabel } from '../lib/runProgress'
import { scheduleSummary } from '../lib/scheduleSummary'
import type { Routine } from '../types'

type Props = {
  routine: Routine
  showOwner?: boolean
  onRun: (id: string) => void
  onStop: (id: string) => void
  onDelete: (routine: Routine) => void
  onOpen: (routine: Routine) => void
}

/** One routine: name, where it shows, its schedule and last run, with run/stop and (if editable) edit/delete. */
export function RoutineListItem({ routine, showOwner = false, onRun, onStop, onDelete, onOpen }: Props) {
  const running = routine.lastRun?.status === 'RUNNING'
  const details = [showOwner && routine.owner?.name, routine.room?.name ?? 'Whole house', scheduleSummary(routine.schedules)].filter(Boolean).join(' · ')
  // Countdowns tick in the Running now section; here the step is enough.
  const status = currentStepLabel(routine.steps, routine.lastRun) ?? runLabel(routine.lastRun).text
  return (
    <ListItem
      divider
      secondaryAction={
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {running ? (
            <IconButton aria-label={`Stop ${routine.name}`} onClick={() => onStop(routine.id)}>
              <StopIcon />
            </IconButton>
          ) : (
            <IconButton aria-label={`Run ${routine.name}`} onClick={() => onRun(routine.id)}>
              <PlayArrowIcon />
            </IconButton>
          )}
          {routine.editable && (
            <>
              <IconButton component={RouterLink} to={`/routines/${routine.id}`} aria-label={`Edit ${routine.name}`}>
                <EditOutlinedIcon />
              </IconButton>
              <IconButton aria-label={`Delete ${routine.name}`} onClick={() => onDelete(routine)}>
                <DeleteOutlineIcon />
              </IconButton>
            </>
          )}
        </Box>
      }
      disablePadding
    >
      <ListItemButton onClick={() => onOpen(routine)} aria-label={`${routine.name} details`} sx={{ pr: routine.editable ? 18 : 8 }}>
      <ListItemText
        primary={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            {routine.name}
            {routine.scope === 'SHARED' && <Chip size="small" label="Shared" />}
          </Box>
        }
        secondary={
          <>
            <span>{details}</span>
            {status && <Box component="span" sx={{ display: 'block' }}>{status}</Box>}
          </>
        }
      />
      </ListItemButton>
    </ListItem>
  )
}
