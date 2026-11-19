import { useParams } from 'react-router'
import { useCurrentUser } from '../auth/useCurrentUser'
import { Dashboard } from '../dashboard/Dashboard'
import { useIsDesktop } from '../layout/useIsDesktop'
import { PageTransition } from '../motion/PageTransition'

/** `/rooms/:roomId`: one room, with a way back to the room grid on a phone. */
export function DashboardPage() {
  const { user } = useCurrentUser()
  const { roomId = '' } = useParams()
  const desktop = useIsDesktop()
  return (
    <PageTransition key={roomId}>
      <Dashboard isAdmin={user?.role === 'ADMIN'} room={roomId} showBack={!desktop} />
    </PageTransition>
  )
}
