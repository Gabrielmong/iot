import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { CLOUD_UNAVAILABLE_MESSAGE } from '../lib/cloudStream'
import type { PlayerPhase } from '../lib/playerMachine'

const MESSAGES: Partial<Record<PlayerPhase, string>> = {
  connecting: 'Connecting…',
  retrying: 'Reconnecting…',
  unavailable: 'Camera unavailable',
  cloudUnavailable: CLOUD_UNAVAILABLE_MESSAGE,
}

/** A centred message over the video while it is not playing. */
export function PlayerStatus({ phase }: { phase: PlayerPhase }) {
  const message = MESSAGES[phase]
  if (!message) return null
  const busy = phase === 'connecting' || phase === 'retrying'
  return (
    <Box
      role="status"
      sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center', color: 'common.white' }}
    >
      {busy && <CircularProgress size={28} color="inherit" />}
      <Typography variant="body2">{message}</Typography>
    </Box>
  )
}
