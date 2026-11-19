import { Navigate } from 'react-router'
import { RoomGrid } from '../dashboard/rooms/RoomGrid'
import { useIsDesktop } from '../layout/useIsDesktop'
import { PageTransition } from '../motion/PageTransition'

/** `/rooms`: the room grid on a phone; a computer lists the rooms in the side menu, so it goes to All devices. */
export function RoomsPage() {
  const desktop = useIsDesktop()
  if (desktop) return <Navigate to="/all" replace />
  return (
    <PageTransition key="rooms">
      <RoomGrid />
    </PageTransition>
  )
}
