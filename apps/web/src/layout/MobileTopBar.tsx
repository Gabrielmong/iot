import MenuIcon from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import { FullScreenButton } from './FullScreenButton'
import { NavBrand } from './nav/NavBrand'

type Props = { homeName: string; menuOpen: boolean; onMenu: () => void }

/** Small screens only: the menu button and the home's name. */
export function MobileTopBar({ homeName, menuOpen, onMenu }: Props) {
  return (
    <AppBar position="sticky" color="transparent" elevation={0}>
      <Toolbar sx={{ gap: 1 }}>
        <IconButton edge="start" aria-label="Open menu" aria-expanded={menuOpen} onClick={onMenu} color="inherit">
          <MenuIcon />
        </IconButton>
        <NavBrand homeName={homeName} />
        <Box sx={{ ml: 'auto' }}>
          <FullScreenButton />
        </Box>
      </Toolbar>
    </AppBar>
  )
}
