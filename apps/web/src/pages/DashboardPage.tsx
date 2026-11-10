import { useParams } from 'react-router'
import { useCurrentUser } from '../auth/useCurrentUser'
import { Dashboard } from '../dashboard/Dashboard'
import { ALL_TAB } from '../dashboard/lib/roomTabs'
import { RoomGrid } from '../dashboard/rooms/RoomGrid'
import { useIsDesktop } from '../layout/useIsDesktop'
import { PageTransition } from '../motion/PageTransition'

/**
 * The everyday screen. `/rooms/:roomId` is one room (or `all`); `/` is the room grid on a phone and
 * "All devices" on a computer, whose rooms are in the side menu.
 */
export function DashboardPage() {
  const { user } = useCurrentUser()
  const { roomId } = useParams()
  const desktop = useIsDesktop()
  return (
    <PageTransition key={roomId ?? 'home'}>
      {!roomId && !desktop ? <RoomGrid /> : <Dashboard isAdmin={user?.role === 'ADMIN'} room={roomId ?? ALL_TAB} showBack={!desktop} />}
    </PageTransition>
  )
}
