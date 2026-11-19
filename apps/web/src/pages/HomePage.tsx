import { useCurrentUser } from '../auth/useCurrentUser'
import { Dashboard } from '../dashboard/Dashboard'
import { HOME_TAB } from '../dashboard/lib/roomTabs'
import { PageTransition } from '../motion/PageTransition'

/** `/`: the curated Home, showing only the devices and widgets placed on it. */
export function HomePage() {
  const { user } = useCurrentUser()
  return (
    <PageTransition key="home">
      <Dashboard isAdmin={user?.role === 'ADMIN'} room={HOME_TAB} />
    </PageTransition>
  )
}
