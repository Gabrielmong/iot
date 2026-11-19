import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { RoutineRun } from '../types'

type Note = RoutineRun['notes'][number]

/** "If temperature above 28° → ran Cool down", "Stopped: raining now wasn't met"; inside a called routine, prefixed "Lock up › ". */
export function noteText(n: Note): string {
  const where = n.routineName ? `${n.routineName} › ` : ''
  const ran = n.ranRoutineName ? ` → ran ${n.ranRoutineName}` : ''
  if (n.kind === 'STOPPED') return `${where}Stopped: ${n.conditions} wasn't met`
  if (n.kind === 'IF_MET') return `${where}If ${n.conditions}${ran}`
  return `${where}If ${n.conditions} wasn't met${ran}`
}

/** Which way the run's weather checks went; nothing when it had none. */
export function RunNotes({ notes }: { notes: readonly Note[] }) {
  if (notes.length === 0) return null
  return (
    <Box component="ul" aria-label="Weather checks" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}>
      {notes.map((n, i) => (
        <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary' }}>
          {noteText(n)}
        </Typography>
      ))}
    </Box>
  )
}
