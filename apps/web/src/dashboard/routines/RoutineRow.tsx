import Box from '@mui/material/Box'
import { useState } from 'react'
import { useRoutines } from '../../routines/data/useRoutines'
import { useRunRoutine } from '../../routines/data/useRunRoutine'
import { routinesForTab } from '../../routines/lib/routinesForTab'
import { RunDetailsDialog } from '../../routines/list/RunDetailsDialog'
import type { Device } from '../types'
import { RoutineButton } from './RoutineButton'

/** devices: the dashboard's devices, for naming them in the step details. */
type Props = { tab: string; devices: readonly Device[]; onError: (message: string) => void }

/** The current tab's routines as a scrollable row of buttons (a running one opens its steps); nothing when there are none. */
export function RoutineRow({ tab, devices, onError }: Props) {
  const { routines } = useRoutines()
  const { run, stop } = useRunRoutine(onError)
  const [openId, setOpenId] = useState<string | null>(null)
  const shown = routinesForTab(routines, tab)
  // Re-read from the live list so the details follow the run as it moves on.
  const open = routines.find((r) => r.id === openId) ?? null
  if (shown.length === 0) return null
  return (
    <Box
      role="group"
      aria-label="Routines"
      sx={{ display: 'flex', gap: 1, mt: 1.5, overflowX: 'auto', pb: 0.5, '& > *': { flexShrink: 0 } }}
    >
      {shown.map((routine) => (
        <RoutineButton key={routine.id} routine={routine} onRun={(id) => void run(id)} onOpen={(r) => setOpenId(r.id)} />
      ))}
      {open && (
        <RunDetailsDialog
          routine={open}
          deviceNames={new Map(devices.map((d) => [d.id, d.name]))}
          onStop={() => void stop(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </Box>
  )
}
