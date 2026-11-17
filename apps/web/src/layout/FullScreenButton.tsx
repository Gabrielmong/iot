import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useFullScreen } from './useFullScreen'

type Props = { placement?: 'bottom' | 'right' }

/** Puts the whole app in full screen and back; hidden where the browser can't. */
export function FullScreenButton({ placement = 'bottom' }: Props) {
  const { supported, active, toggle } = useFullScreen()
  if (!supported) return null
  const label = active ? 'Exit full screen' : 'Full screen'
  return (
    <Tooltip title={label} placement={placement}>
      <IconButton aria-label={label} onClick={toggle} size="small" sx={{ color: 'text.secondary' }}>
        {active ? <FullscreenExitIcon /> : <FullscreenIcon />}
      </IconButton>
    </Tooltip>
  )
}
