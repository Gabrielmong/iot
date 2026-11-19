import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import DevicesOtherOutlinedIcon from '@mui/icons-material/DevicesOtherOutlined'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import PlaylistPlayOutlinedIcon from '@mui/icons-material/PlaylistPlayOutlined'
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import type { SvgIconComponent } from '@mui/icons-material'

export type NavLink = {
  to: string
  label: string
  Icon: SvgIconComponent
  /** Also selected on these path prefixes (e.g. device pages under the dashboard). */
  alsoActive?: readonly string[]
  /** Selected only on an exact path match. */
  exact?: boolean
  /** Not shown to guests. */
  hideForGuests?: boolean
}

export const MAIN_LINKS: readonly NavLink[] = [
  { to: '/', label: 'Dashboard', Icon: GridViewOutlinedIcon, exact: true, alsoActive: ['/devices/'] },
  { to: '/weather', label: 'Weather', Icon: WbSunnyOutlinedIcon },
  { to: '/cameras', label: 'Cameras', Icon: VideocamOutlinedIcon, hideForGuests: true },
  { to: '/routines', label: 'Routines', Icon: PlaylistPlayOutlinedIcon },
]

export const ADMIN_LINKS: readonly NavLink[] = [
  { to: '/admin/devices', label: 'Devices', Icon: DevicesOtherOutlinedIcon },
  { to: '/admin/rooms', label: 'Rooms', Icon: CategoryOutlinedIcon },
  { to: '/admin/users', label: 'Users', Icon: GroupOutlinedIcon },
  { to: '/admin/integrations', label: 'Integrations', Icon: ExtensionOutlinedIcon },
  { to: '/admin/settings', label: 'Settings', Icon: TuneOutlinedIcon },
  { to: '/admin/deploys', label: 'Deploys', Icon: RocketLaunchOutlinedIcon },
]
