import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import { Fragment } from 'react'
import { useLocation } from 'react-router'
import { isNavActive } from './isNavActive'
import { ADMIN_LINKS, MAIN_LINKS, type NavLink } from './navItems'
import { NavItem } from './NavItem'
import { NavRooms } from './NavRooms'

type Props = { isAdmin: boolean; isGuest: boolean; collapsed: boolean; showRooms?: boolean }

const headingSx = { bgcolor: 'transparent', lineHeight: '36px', mt: 1.5, px: 2.5, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' } as const

/** The main sections (with the rooms under Dashboard when `showRooms`), then (admins only) the admin pages under their own heading. */
export function NavList({ isAdmin, isGuest, collapsed, showRooms = false }: Props) {
  const { pathname } = useLocation()
  const items = (links: readonly NavLink[]) =>
    links
      .filter((link) => !(isGuest && link.hideForGuests))
      .map((link) => (
        <Fragment key={link.to}>
          <NavItem link={link} active={isNavActive(link, pathname)} collapsed={collapsed} />
          {link.to === '/' && showRooms && !collapsed && <NavRooms />}
        </Fragment>
      ))

  return (
    <nav aria-label="Main">
      <List disablePadding sx={{ pt: 1 }}>{items(MAIN_LINKS)}</List>
      {isAdmin && (
        <List
          disablePadding
          aria-label="Admin"
          subheader={collapsed ? <Divider sx={{ my: 1.5, mx: 2 }} /> : <ListSubheader disableSticky sx={headingSx}>Admin</ListSubheader>}
        >
          {items(ADMIN_LINKS)}
        </List>
      )}
    </nav>
  )
}
