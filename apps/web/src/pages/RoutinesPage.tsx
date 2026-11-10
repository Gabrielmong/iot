import { useCurrentUser } from '../auth/useCurrentUser'
import { PageTransition } from '../motion/PageTransition'
import { RoutineList } from '../routines/list/RoutineList'

/** `/routines`: the routine list. */
export function RoutinesPage() {
  const { user } = useCurrentUser()
  return (
    <PageTransition>
      <RoutineList isAdmin={user?.role === 'ADMIN'} isGuest={user?.role === 'GUEST'} />
    </PageTransition>
  )
}
