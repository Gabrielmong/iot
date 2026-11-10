import Box from '@mui/material/Box'
import { useCallback, useState } from 'react'
import { Outlet } from 'react-router'
import { useCurrentUser } from '../auth/useCurrentUser'
import { useSignOut } from '../auth/useSignOut'
import { useHomeName } from '../home/data/useHomeName'
import { useDocumentTitle } from '../home/useDocumentTitle'
import { MobileTopBar } from './MobileTopBar'
import { MobileNav } from './nav/MobileNav'
import { SideNav } from './nav/SideNav'
import { useNavCollapsed } from './nav/useNavCollapsed'
import { useIsDesktop } from './useIsDesktop'

/** Signed-in frame: side menu (permanent on desktop, slide-out on small screens) beside the routed page. */
export function AppShell() {
  const { user } = useCurrentUser()
  const signOut = useSignOut()
  const homeName = useHomeName()
  useDocumentTitle(homeName)
  const desktop = useIsDesktop()
  const [collapsed, toggleCollapsed] = useNavCollapsed()
  const [mobileOpen, setMobileOpen] = useState(false)
  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const nav = { homeName, isAdmin: user?.role === 'ADMIN', isGuest: user?.role === 'GUEST', hasPin: user?.hasPin ?? false, userName: user?.name ?? '', userColor: user?.avatarColor ?? 'transparent', userImage: user?.avatarImage ?? null, onSignOut: () => void signOut() }

  return (
    <Box sx={{ display: 'flex', minHeight: '100%' }}>
      {desktop ? (
        <SideNav {...nav} collapsed={collapsed} onToggle={toggleCollapsed} />
      ) : (
        <MobileNav {...nav} open={mobileOpen} onOpen={openMobile} onClose={closeMobile} />
      )}
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        {!desktop && <MobileTopBar homeName={homeName} menuOpen={mobileOpen} onMenu={openMobile} />}
        <Outlet />
      </Box>
    </Box>
  )
}
