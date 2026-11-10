import { useParams } from 'react-router'
import { useCurrentUser } from '../auth/useCurrentUser'
import { PageTransition } from '../motion/PageTransition'
import { RoutineEditorLoader } from '../routines/editor/RoutineEditorLoader'

/** `/routines/new` and `/routines/:id`: the routine editor. */
export function RoutineEditorPage() {
  const { id = null } = useParams()
  const { user } = useCurrentUser()
  return (
    <PageTransition key={id ?? 'new'}>
      {user && <RoutineEditorLoader id={id} userId={user.id} isAdmin={user.role === 'ADMIN'} />}
    </PageTransition>
  )
}
