import Typography from '@mui/material/Typography'
import { problemText } from '../lib/runLabel'
import type { RoutineRun } from '../types'

/** What went wrong inside a called routine, one line per problem. */
export function CalledRoutineProblems({ problems }: { problems: RoutineRun['problems'] }) {
  return problems.map((p, i) => (
    <Typography key={i} variant="body2" sx={{ color: 'warning.main' }}>
      {`⚠ ${problemText(p)}`}
    </Typography>
  ))
}
