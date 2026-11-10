import List from '@mui/material/List'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useId, type ReactNode } from 'react'

/** A titled group of routines (a labelled region, so it reads as one block). */
export function RoutineSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <Typography id={id} variant="overline" component="h2" sx={{ color: 'text.secondary' }}>
        {title}
      </Typography>
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <List disablePadding>{children}</List>
      </Paper>
    </section>
  )
}
