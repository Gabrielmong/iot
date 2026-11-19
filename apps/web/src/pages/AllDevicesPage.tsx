import { useCurrentUser } from '../auth/useCurrentUser'
import { Dashboard } from '../dashboard/Dashboard'
import { ALL_TAB } from '../dashboard/lib/roomTabs'
import { useIsDesktop } from '../layout/useIsDesktop'
import { PageTransition } from '../motion/PageTransition'

/** `/all`: every device, with a way back to the room grid on a phone. */
export function AllDevicesPage() {
  const { user } = useCurrentUser()
  const desktop = useIsDesktop()
  return (
    <PageTransition key="all">
      <Dashboard isAdmin={user?.role === 'ADMIN'} room={ALL_TAB} showBack={!desktop} />
    </PageTransition>
  )
}
