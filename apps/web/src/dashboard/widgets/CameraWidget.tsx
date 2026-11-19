import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useRef } from 'react'
import { TileVideo } from '../../cameras/tile/TileVideo'
import { useDocumentVisible } from '../../device/camera/useDocumentVisible'
import type { Device } from '../types'
import { useLiveSlot } from './live/LiveSlotsProvider'
import { useInViewport } from './useInViewport'

const noop = () => {}

/**
 * A camera's live view (light stream, muted), only while on screen and the page is shown, and only
 * if one of the screen's two live slots is free; otherwise its name and Play, which takes a slot.
 */
export function CameraWidget({ device }: { device: Device }) {
  const ref = useRef<HTMLDivElement>(null)
  const onScreen = useInViewport(ref)
  const pageShown = useDocumentVisible()
  const { live, take } = useLiveSlot(device.id, onScreen && pageShown)
  return (
    <Box ref={ref} sx={{ position: 'relative', height: '100%', bgcolor: 'common.black' }}>
      {live && <TileVideo deviceId={device.id} cloud={device.connection === 'CLOUD'} onPhase={noop} />}
      {!live && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <IconButton aria-label={`Play ${device.name}`} onClick={take} sx={{ pointerEvents: 'auto', bgcolor: 'rgba(12, 17, 32, 0.7)' }}>
            <PlayArrowRoundedIcon fontSize="large" />
          </IconButton>
        </Box>
      )}
      <Typography
        variant="caption"
        noWrap
        sx={{ position: 'absolute', left: 8, bottom: 6, right: 8, color: 'common.white', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
      >
        {device.name}
      </Typography>
    </Box>
  )
}
