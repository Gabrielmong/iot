import RefreshIcon from '@mui/icons-material/Refresh'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { isHomeApp } from '../android/isHomeApp'

type Props = { placement?: 'bottom' | 'right'; userAgent?: string; reload?: () => void }

/**
 * Inside the Android app only (a browser has its own reload): reloads the page so a new deploy shows.
 * index.html is revalidated on every load and assets are content-hashed, so a reload is enough.
 */
export function ReloadAppButton({ placement = 'bottom', userAgent = navigator.userAgent, reload = () => window.location.reload() }: Props) {
  if (!isHomeApp(userAgent)) return null
  return (
    <Tooltip title="Reload app" placement={placement}>
      <IconButton aria-label="Reload app" onClick={reload} size="small" sx={{ color: 'text.secondary' }}>
        <RefreshIcon />
      </IconButton>
    </Tooltip>
  )
}
