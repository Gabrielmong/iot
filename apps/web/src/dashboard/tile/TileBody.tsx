import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Device } from '../types'
import { isCamera, needsSetup } from '../lib/capabilities'
import { dotColor } from '../lib/dotColor'
import { FONT_DISPLAY } from '../../theme/tokens'
import { CameraTileThumb } from './CameraTileThumb'
import { ColorDot } from './ColorDot'
import { TileStateLine } from './TileStateLine'

/** The tile's text: name, room, then a camera's thumbnail or the state line (with a color dot for lights). */
export function TileBody({ device }: { device: Device }) {
  const dot = dotColor(device)
  return (
    <Box sx={{ minWidth: 0, width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="subtitle1" noWrap sx={{ fontFamily: FONT_DISPLAY, fontWeight: 650, fontSize: 17, lineHeight: 1.3 }}>
        {device.name}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap component="div">
        {device.room?.name ?? 'No room'}
      </Typography>
      {isCamera(device) && !needsSetup(device) ? (
        <Box sx={{ mt: 1.25, flex: 1, minHeight: 0 }}>
          <CameraTileThumb deviceId={device.id} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
          {dot && <ColorDot color={dot} />}
          <TileStateLine device={device} />
        </Box>
      )}
    </Box>
  )
}
