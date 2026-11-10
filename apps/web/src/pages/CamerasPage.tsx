import { useCurrentUser } from '../auth/useCurrentUser'
import { CamerasView } from '../cameras/CamerasView'
import { PageTransition } from '../motion/PageTransition'

/** `/cameras`: the multi-camera view. */
export function CamerasPage() {
  const { user } = useCurrentUser()
  return (
    <PageTransition>
      <CamerasView isAdmin={user?.role === 'ADMIN'} />
    </PageTransition>
  )
}
