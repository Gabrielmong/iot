import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { NavFooter } from './NavFooter'
import { NavList } from './NavList'

export type NavProps = { homeName: string; isAdmin: boolean; isGuest: boolean; hasPin: boolean; userName: string; userColor: string; userImage: string | null; onSignOut: () => void }

type Props = Omit<NavProps, 'homeName'> & { header: ReactNode; collapsed: boolean; showRooms?: boolean }

/** Shared drawer body: header row, scrollable links, user footer. */
export function NavContent({ header, isAdmin, isGuest, hasPin, userName, userColor, userImage, collapsed, showRooms, onSignOut }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {header}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <NavList isAdmin={isAdmin} isGuest={isGuest} collapsed={collapsed} showRooms={showRooms} />
      </Box>
      <NavFooter isGuest={isGuest} hasPin={hasPin} userName={userName} userColor={userColor} userImage={userImage} collapsed={collapsed} onSignOut={onSignOut} />
    </Box>
  )
}
