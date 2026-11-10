import StopIcon from '@mui/icons-material/Stop'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { stepProgress } from '../lib/runProgress'
import type { Routine } from '../types'
import { RoutineSection } from './RoutineSection'
import { useNow } from './useNow'

type Props = { routines: readonly Routine[]; onOpen: (routine: Routine) => void; onStop: (id: string) => void }

/** Routines in progress, each with its current step and a progress bar; nothing when none are running. */
export function RunningSection({ routines, onOpen, onStop }: Props) {
  const running = routines.filter((r) => r.lastRun?.status === 'RUNNING')
  const now = useNow(1000, running.length > 0)
  if (running.length === 0) return null
  return (
    <RoutineSection title="Running now">
      {running.map((r) => {
        const progress = stepProgress(r.steps, r.lastRun, now)
        return (
          <ListItem
            key={r.id}
            divider
            disablePadding
            secondaryAction={
              <IconButton aria-label={`Stop ${r.name}`} onClick={() => onStop(r.id)}>
                <StopIcon />
              </IconButton>
            }
          >
            <ListItemButton onClick={() => onOpen(r)} aria-label={`${r.name} details`} sx={{ display: 'block', pr: 8 }}>
              <ListItemText primary={r.name} secondary={progress?.label ?? 'Running…'} />
              <LinearProgress variant="determinate" value={(progress?.fraction ?? 0) * 100} sx={{ mt: 0.5, mb: 0.5 }} />
            </ListItemButton>
          </ListItem>
        )
      })}
    </RoutineSection>
  )
}
