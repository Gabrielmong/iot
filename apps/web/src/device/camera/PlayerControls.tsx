import FullscreenIcon from '@mui/icons-material/Fullscreen'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'

type Props = { muted: boolean; onToggleMute: () => void; onFullScreen: () => void }

const button = { color: 'common.white', bgcolor: 'rgba(0, 0, 0, 0.45)', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.65)' } }

/** Mute toggle and full screen, over the bottom-right of the video. */
export function PlayerControls({ muted, onToggleMute, onFullScreen }: Props) {
  return (
    <Box sx={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 1 }}>
      <IconButton size="small" aria-label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute} sx={button}>
        {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
      </IconButton>
      <IconButton size="small" aria-label="Full screen" onClick={onFullScreen} sx={button}>
        <FullscreenIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
