import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import { alpha } from '@mui/material/styles'
import { Link as RouterLink } from 'react-router'
import { palette } from '../../theme/tokens'
import type { NavLink } from './navItems'

type Props = { link: NavLink; active: boolean; collapsed: boolean }

/** One menu entry. Collapsed, it shows only the icon and names itself in a tooltip. */
export function NavItem({ link, active, collapsed }: Props) {
  const { Icon } = link
  const button = (
    <ListItemButton
      component={RouterLink}
      to={link.to}
      selected={active}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? link.label : undefined}
      sx={{
        minHeight: 46,
        mx: 1,
        mb: 0.5,
        px: 1.5,
        borderRadius: 2,
        justifyContent: collapsed ? 'center' : 'flex-start',
        color: active ? 'primary.main' : 'text.secondary',
        border: '1px solid transparent',
        '&.Mui-selected, &.Mui-selected:hover': {
          bgcolor: alpha(palette.lamp, 0.12),
          borderColor: alpha(palette.lamp, 0.3),
        },
        '&:hover': { color: active ? 'primary.main' : 'text.primary' },
      }}
    >
      <ListItemIcon sx={{ minWidth: 0, mr: collapsed ? 0 : 1.75, color: 'inherit' }}>
        <Icon />
      </ListItemIcon>
      {!collapsed && <ListItemText primary={link.label} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />}
    </ListItemButton>
  )
  return collapsed ? (
    <Tooltip title={link.label} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}
