import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type ReactNode, useId } from 'react'

type Props = { title: string; actions?: ReactNode; children: ReactNode }

/** A titled region (landmark named by its heading) with optional header actions. */
export function PageSection({ title, actions, children }: Props) {
  const id = useId()
  return (
    <Box component="section" aria-labelledby={id} sx={{ mb: 4 }}>
      <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography id={id} variant="h6" component="h2">{title}</Typography>
        {actions}
      </Stack>
      {children}
    </Box>
  )
}
