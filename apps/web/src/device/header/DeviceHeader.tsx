import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { connectionLabel } from '../lib/connectionLabel'
import type { DeviceDetail } from '../types'
import { OnlineChip } from './OnlineChip'
import { useBackTarget } from './useBackTarget'

/** Back link (to the room it was opened from), name, and the room / online / connection chips. */
export function DeviceHeader({ device }: { device: DeviceDetail }) {
  const back = useBackTarget()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25, py: 0.5 }}>
      <IconButton
        component={Link}
        to={back}
        aria-label="Back to dashboard"
        sx={{ border: 1, borderColor: 'divider', transition: 'transform 160ms', '&:hover': { transform: 'translateX(-2px)' } }}
      >
        <ArrowBackIcon />
      </IconButton>
      <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 26, sm: 32 }, mr: 0.5 }}>
        {device.name}
      </Typography>
      {device.room && <Chip size="small" label={device.room.name} />}
      <OnlineChip online={device.state.online} />
      {device.connection === 'CLOUD' && <Chip size="small" variant="outlined" label={connectionLabel(device)} />}
    </Box>
  )
}
