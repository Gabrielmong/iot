import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router'

/** Admin shortcut from a not-ready device to the Devices admin page. */
export function NeedsSetupLink() {
  return (
    <Link component={RouterLink} to="/admin/devices" variant="body2" sx={{ px: 2, pb: 1.5 }}>
      Set up in Devices
    </Link>
  )
}
