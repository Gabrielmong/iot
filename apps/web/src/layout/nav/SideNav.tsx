import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import { alpha, type Theme } from '@mui/material/styles'
import { palette } from '../../theme/tokens'
import { NavBrand } from './NavBrand'
import { NavContent, type NavProps } from './NavContent'

/** Side menu widths in px: expanded, and collapsed to icons. */
const WIDTH = 248
const WIDTH_COLLAPSED = 72

type Props = NavProps & { collapsed: boolean; onToggle: () => void }

const widthTransition = (t: Theme) => t.transitions.create('width', { duration: t.transitions.duration.shorter })

/** Desktop: a permanent side menu that collapses to an icon rail. */
export function SideNav({ homeName, collapsed, onToggle, ...rest }: Props) {
  const width = collapsed ? WIDTH_COLLAPSED : WIDTH
  const toggleLabel = collapsed ? 'Expand menu' : 'Collapse menu'
  const header = (
    <Stack
      direction={collapsed ? 'column' : 'row'}
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 64, px: collapsed ? 1 : 2, py: collapsed ? 1.5 : 0 }}
    >
      <NavBrand homeName={homeName} showName={!collapsed} />
      <Tooltip title={toggleLabel} placement="right">
        <IconButton aria-label={toggleLabel} aria-expanded={!collapsed} onClick={onToggle} size="small" sx={{ color: 'text.secondary' }}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Tooltip>
    </Stack>
  )
  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: widthTransition,
        '& .MuiDrawer-paper': {
          width,
          overflowX: 'hidden',
          boxSizing: 'border-box',
          bgcolor: alpha(palette.night, 0.72),
          backdropFilter: 'blur(14px) saturate(140%)',
          borderRight: 1,
          borderColor: 'divider',
          transition: widthTransition,
        },
      }}
    >
      <NavContent header={header} collapsed={collapsed} showRooms {...rest} />
    </Drawer>
  )
}
