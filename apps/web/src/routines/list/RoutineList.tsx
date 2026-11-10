import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useQuery } from '@apollo/client/react'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useDevices } from '../../dashboard/data/useDevices'
import { ErrorSnackbar } from '../../dashboard/ErrorSnackbar'
import { OTHER_ROUTINES } from '../data/documents'
import { useRoutines } from '../data/useRoutines'
import { useRunRoutine } from '../data/useRunRoutine'
import type { Routine } from '../types'
import { ConfirmDeleteRoutineDialog } from './ConfirmDeleteRoutineDialog'
import { RoutineListItem } from './RoutineListItem'
import { RoutineSection } from './RoutineSection'
import { RunDetailsDialog } from './RunDetailsDialog'
import { RunningSection } from './RunningSection'

/** The Routines page body: my routines, shared ones, and (admins) other users' routines. */
export function RoutineList({ isAdmin, isGuest = false }: { isAdmin: boolean; isGuest?: boolean }) {
  const { routines, loading } = useRoutines()
  const others = useQuery(OTHER_ROUTINES, { skip: !isAdmin, fetchPolicy: 'cache-and-network' }).data?.otherRoutines ?? []
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Routine | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { devices } = useDevices()
  const deviceNames = new Map(devices.map((d) => [d.id, d.name]))
  const { run, stop } = useRunRoutine(setError)
  const item = (r: Routine, showOwner = false) => (
    <RoutineListItem key={r.id} routine={isGuest ? { ...r, editable: false } : r} showOwner={showOwner} onRun={(id) => void run(id)} onStop={(id) => void stop(id)} onDelete={setDeleting} onOpen={(o) => setOpenId(o.id)} />
  )
  const mine = routines.filter((r) => r.scope === 'PERSONAL')
  const shared = routines.filter((r) => r.scope === 'SHARED')
  const empty = !loading && routines.length === 0 && others.length === 0
  const all = [...routines, ...others]
  // Re-read from the live lists so the details follow the run as it moves on.
  const open = all.find((r) => r.id === openId) ?? null

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" component="h1">
          Routines
        </Typography>
        {!isGuest && (
          <Button component={RouterLink} to="/routines/new" variant="contained" startIcon={<AddIcon />}>
            New routine
          </Button>
        )}
      </Box>
      <RunningSection routines={all} onOpen={(r) => setOpenId(r.id)} onStop={(id) => void stop(id)} />
      {empty && <Typography sx={{ color: 'text.secondary' }}>No routines yet.</Typography>}
      {mine.length > 0 && <RoutineSection title="My routines">{mine.map((r) => item(r))}</RoutineSection>}
      {shared.length > 0 && <RoutineSection title="Shared">{shared.map((r) => item(r))}</RoutineSection>}
      {others.length > 0 && <RoutineSection title="Other users">{others.map((r) => item(r, true))}</RoutineSection>}
      {open && <RunDetailsDialog routine={open} deviceNames={deviceNames} onStop={() => void stop(open.id)} onClose={() => setOpenId(null)} />}
      {deleting && <ConfirmDeleteRoutineDialog routine={deleting} onClose={() => setDeleting(null)} />}
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  )
}
