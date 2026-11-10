import CheckIcon from '@mui/icons-material/Check'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import { useState } from 'react'
import { runLabel } from '../../routines/lib/runLabel'
import type { Routine } from '../../routines/types'
import { RunProblemsDialog } from './RunProblemsDialog'

type Props = { routine: Routine; onRun: (id: string) => void; onOpen: (routine: Routine) => void }

/**
 * One routine: tap runs it, or (while it runs) opens its step details; a spinner while running, ✓ when
 * done, ⚠ (opens the problems) after trouble.
 */
export function RoutineButton({ routine, onRun, onOpen }: Props) {
  const [showProblems, setShowProblems] = useState(false)
  const run = routine.lastRun
  const { icon } = runLabel(run)
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <Button variant="outlined" size="small" onClick={() => (icon === 'running' ? onOpen(routine) : onRun(routine.id))} sx={{ borderRadius: 999, textTransform: 'none' }}>
        {routine.name}
      </Button>
      {icon === 'running' && <CircularProgress size={16} sx={{ ml: 1 }} aria-label={`${routine.name} is running`} />}
      {icon === 'ok' && <CheckIcon fontSize="small" color="success" sx={{ ml: 0.5 }} titleAccess="Done" />}
      {icon === 'warn' && (
        <IconButton size="small" color="warning" aria-label={`Show problems with ${routine.name}`} onClick={() => setShowProblems(true)}>
          <WarningAmberIcon fontSize="small" />
        </IconButton>
      )}
      {showProblems && run && <RunProblemsDialog name={routine.name} run={run} onClose={() => setShowProblems(false)} />}
    </Box>
  )
}
