import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import type { NavLink } from './navItems'
import { NavItem } from './NavItem'
import { NavRooms } from './NavRooms'
import { useStoredFlag } from './useStoredFlag'

type Props = { link: NavLink; active: boolean }

/** Desktop, expanded menu: All devices with its rooms underneath, which fold away (remembered on this device). */
export function NavAllDevices({ link, active }: Props) {
  const [open, toggle] = useStoredFlag('home.navRoomsOpen', true)
  return (
    <>
      <Box sx={{ position: 'relative' }}>
        <NavItem link={link} active={active} collapsed={false} />
        <IconButton
          size="small"
          aria-label={open ? 'Hide rooms' : 'Show rooms'}
          aria-expanded={open}
          onClick={toggle}
          sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(calc(-50% - 2px))', color: 'text.secondary' }}
        >
          <ExpandMoreRoundedIcon
            fontSize="small"
            sx={{ transition: (theme) => theme.transitions.create('transform'), transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </IconButton>
      </Box>
      <Collapse in={open} unmountOnExit>
        <NavRooms />
      </Collapse>
    </>
  )
}
