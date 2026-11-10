import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { runLabel } from '../lib/runLabel'
import type { RoutineRun } from '../types'

type Props = {
  errors: readonly string[]
  canTry: boolean
  saving: boolean
  tryRun: RoutineRun | null
  onTry: () => void
  onStopTry: () => void
  onSave: () => void
}

/** Try it (with live status and Stop; needs no name yet) and Save, which is disabled with the reasons listed. */
export function EditorActions({ errors, canTry, saving, tryRun, onTry, onStopTry, onSave }: Props) {
  const running = tryRun?.status === 'RUNNING'
  const blocked = errors.length > 0
  return (
    <Box>
      {blocked && (
        <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5, color: 'text.secondary' }}>
          {errors.map((e) => (
            <Typography component="li" variant="body2" key={e}>
              {e}
            </Typography>
          ))}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
        {tryRun && !running && <Typography variant="body2" sx={{ color: 'text.secondary', mr: 'auto' }}>Try it: {runLabel(tryRun).text}</Typography>}
        {running ? (
          <Button variant="outlined" startIcon={<StopIcon />} onClick={onStopTry}>
            Stop
          </Button>
        ) : (
          <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={onTry} disabled={!canTry}>
            Try it
          </Button>
        )}
        {running && <CircularProgress size={18} aria-label="Trying the routine" />}
        <Button variant="contained" onClick={onSave} disabled={blocked || saving}>
          Save
        </Button>
      </Box>
    </Box>
  )
}
