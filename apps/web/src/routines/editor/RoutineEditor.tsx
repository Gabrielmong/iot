import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useRooms } from '../../dashboard/data/useRooms'
import type { Device } from '../../dashboard/types'
import { useSaveRoutine } from '../data/useSaveRoutine'
import { useTryRun } from '../data/useTryRoutine'
import { draftToInput, type Draft } from '../lib/draft'
import { draftErrors } from '../lib/draftErrors'
import { routineErrorMessage } from '../lib/routineErrorMessage'
import { AudienceChecklist } from './AudienceChecklist'
import { EditorActions } from './EditorActions'
import { NameRoomFields } from './NameRoomFields'
import { ScheduleList } from './ScheduleList'
import { StepList } from './StepList'

type Props = { initial: Draft; routineId: string | null; isAdmin: boolean; devices: readonly Device[]; notice?: string | null }

/** Edits a routine draft top to bottom: name and tab, steps, schedule, (admins) sharing, then Try it / Save. */
export function RoutineEditor({ initial, routineId, isAdmin, devices, notice }: Props) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const rooms = useRooms()
  const { save, saving } = useSaveRoutine()
  const tryRun = useTryRun()
  const navigate = useNavigate()
  const errors = draftErrors(draft)
  // Trying doesn't need a name yet.
  const tryable = { ...draft, name: draft.name.trim() || 'Try it' }
  const tryErrors = draftErrors(tryable)
  const shared = draft.scope === 'SHARED'

  const onSave = () => {
    setError(null)
    save(routineId, draftToInput(draft)).then(
      () => navigate('/routines'),
      (e: unknown) => setError(routineErrorMessage(e)),
    )
  }
  const onTry = () => void tryRun.tryDraft(draftToInput(tryable)).catch((e: unknown) => setError(routineErrorMessage(e)))

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        {routineId ? 'Edit routine' : 'New routine'}
      </Typography>
      <Stack spacing={2}>
        {notice && <Alert severity="info">{notice}</Alert>}
        <NameRoomFields name={draft.name} roomId={draft.roomId} rooms={rooms} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        {isAdmin && routineId === null && (
          <FormControlLabel
            label="Shared routine"
            control={<Checkbox checked={shared} onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.checked ? 'SHARED' : 'PERSONAL' }))} />}
          />
        )}
        <Section title="Steps">
          <StepList draft={draft} devices={devices} rooms={rooms} routineId={routineId} onChange={setDraft} />
        </Section>
        <Section title="Schedule">
          <ScheduleList draft={draft} onChange={setDraft} />
        </Section>
        {isAdmin && shared && (
          <Section title="Who can see it">
            <AudienceChecklist includeGuests selected={draft.audience} onChange={(audience) => setDraft((d) => ({ ...d, audience }))} />
          </Section>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <EditorActions errors={errors} canTry={tryErrors.length === 0} saving={saving} tryRun={tryRun.run} onTry={onTry} onStopTry={() => void tryRun.stop().catch(() => {})} onSave={onSave} />
      </Stack>
    </Box>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" component="h2" sx={{ color: 'text.secondary' }}>
        {title}
      </Typography>
      {children}
    </Paper>
  )
}
