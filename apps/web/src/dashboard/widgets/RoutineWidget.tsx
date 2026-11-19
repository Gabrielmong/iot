import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useRunRoutine } from '../../routines/data/useRunRoutine'
import type { Routine } from '../../routines/types'
import { ErrorSnackbar } from '../ErrorSnackbar'

const fill = { height: '100%', width: '100%', p: 2, alignItems: 'flex-start', justifyContent: 'space-between', overflow: 'hidden' } as const

/** A routine as a big button: tap runs it; while it runs, "Running…" and a Stop button. */
export function RoutineWidget({ routine }: { routine: Routine }) {
  const [error, setError] = useState<string | null>(null)
  const { run, stop } = useRunRoutine(setError)
  const running = routine.lastRun?.status === 'RUNNING'
  const name = (
    <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
      {routine.name}
    </Typography>
  )
  return (
    <>
      {running ? (
        <Stack sx={fill}>
          {name}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CircularProgress size={16} aria-hidden />
            <Typography variant="body2" color="text.secondary">
              Running…
            </Typography>
          </Stack>
          <Button size="small" variant="outlined" aria-label={`Stop ${routine.name}`} onClick={() => void stop(routine.id)}>
            Stop
          </Button>
        </Stack>
      ) : (
        <ButtonBase aria-label={`Run ${routine.name}`} onClick={() => void run(routine.id)} sx={{ height: '100%', width: '100%', textAlign: 'left' }}>
          <Stack sx={fill}>
            {name}
            <PlayArrowRoundedIcon color="primary" sx={{ fontSize: 36 }} aria-hidden />
          </Stack>
        </ButtonBase>
      )}
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </>
  )
}
