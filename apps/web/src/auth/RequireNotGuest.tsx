import { Navigate, Outlet } from 'react-router'
import { useCurrentUser } from './useCurrentUser'

/** Route guard (nest inside RequireAuth): guests are sent home; everyone else sees the nested routes. */
export function RequireNotGuest() {
  const { user } = useCurrentUser()
  if (user?.role === 'GUEST') return <Navigate to="/" replace />
  return <Outlet />
}
