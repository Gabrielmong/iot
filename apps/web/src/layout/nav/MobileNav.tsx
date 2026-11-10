import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { NavBrand } from './NavBrand'
import { NavContent, type NavProps } from './NavContent'

type Props = NavProps & { open: boolean; onOpen: () => void; onClose: () => void }

/** Small screens: a slide-out menu (menu button, or swipe in from the left edge) that closes on navigation. */
export function MobileNav({ homeName, open, onOpen, onClose, ...rest }: Props) {
  const { pathname } = useLocation()
  useEffect(() => onClose(), [pathname, onClose])

  const header = (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 56, pl: 2, pr: 1 }}>
      <NavBrand homeName={homeName} />
      <IconButton aria-label="Close menu" onClick={onClose} sx={{ color: 'text.secondary' }}>
        <CloseIcon />
      </IconButton>
    </Stack>
  )
  return (
    <SwipeableDrawer
      anchor="left"
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      swipeAreaWidth={16}
      slotProps={{ paper: { sx: { width: 'min(280px, 85vw)', bgcolor: 'background.default' } } }}
    >
      <NavContent header={header} collapsed={false} {...rest} />
    </SwipeableDrawer>
  )
}
