import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import type { IntegrationInfo } from '../lib/integrations'
import { LastSynced } from './LastSynced'

type Props = { info: IntegrationInfo; configured: boolean; lastSync: string | null; children: ReactNode }

/** One integration's tab: what it does, whether it is set up, when it last synced, then its forms. */
export function IntegrationView({ info, configured, lastSync, children }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6" component="h2">
            {info.label}
          </Typography>
          <Typography color="text.secondary">{info.description}</Typography>
          <LastSynced at={lastSync} />
        </Box>
        <Chip size="small" color={configured ? 'success' : 'default'} label={configured ? 'Configured' : 'Not configured'} />
      </Box>
      {children}
    </Paper>
  )
}
