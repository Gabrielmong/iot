import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useQuery } from '@apollo/client/react'
import { ROUTINE } from '../data/documents'
import { emptyDraft, routineToDraft } from '../lib/draft'
import { usableDevices } from '../lib/usableDevices'
import type { Routine } from '../types'
import { RoutineEditor } from './RoutineEditor'
import { useEditorDevices } from './useEditorDevices'

type Props = { id: string | null; userId: string; isAdmin: boolean }

/** Loads the routine (for /routines/:id) and the devices it may use, then opens the editor. */
export function RoutineEditorLoader({ id, userId, isAdmin }: Props) {
  const { data, loading } = useQuery(ROUTINE, { variables: { id: id ?? '' }, skip: id === null, fetchPolicy: 'network-only' })
  const routine = data?.routine ?? null
  const ownerId = editingForOther(routine, userId)
  const devices = useEditorDevices(ownerId)

  if ((id && loading) || devices.loading) return <Loading />
  if (id && !routine) return <NotFound />
  if (!routine) return <RoutineEditor key="new" initial={emptyDraft('PERSONAL')} routineId={null} isAdmin={isAdmin} devices={devices.devices} />

  const { draft, droppedDevices } = routineToDraft(routine, usableDevices(devices.devices))
  const notice = droppedDevices > 0 ? `${droppedDevices === 1 ? '1 device' : `${droppedDevices} devices`} in this routine ${droppedDevices === 1 ? 'was' : 'were'} removed. Save to tidy it up.` : null
  return <RoutineEditor key={routine.id} initial={draft} routineId={routine.id} isAdmin={isAdmin} devices={devices.devices} notice={notice} />
}

/** A regular user's personal routine opened by someone else (an admin): its owner's devices apply. */
function editingForOther(routine: Routine | null, userId: string): string | null {
  const owner = routine?.owner
  return owner && owner.id !== userId && owner.role === 'USER' ? owner.id : null
}

function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
      <CircularProgress aria-label="Loading routine" />
    </Box>
  )
}

function NotFound() {
  return <Typography sx={{ p: 3, color: 'text.secondary' }}>This routine doesn’t exist or isn’t yours to edit.</Typography>
}
