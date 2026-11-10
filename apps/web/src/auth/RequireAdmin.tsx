import { Navigate, Outlet } from 'react-router'
import { useCurrentUser } from './useCurrentUser'

/** Route guard (nest inside RequireAuth): only ADMIN users see the nested routes. */
export function RequireAdmin() {
  const { user } = useCurrentUser()
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />
  return <Outlet />
}
