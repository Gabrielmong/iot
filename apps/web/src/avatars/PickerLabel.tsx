import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

/** Small caption above a picker in the user dialog. Decorative: each picker names itself with aria-label. */
export function PickerLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" aria-hidden sx={{ display: 'block', mb: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </Typography>
  )
}
