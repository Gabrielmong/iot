import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { Navigate, Outlet } from 'react-router'
import { SharedScreenIdleGate } from './SharedScreenIdleGate'
import { useCurrentUser } from './useCurrentUser'

/** Route guard: signed-in users see the nested routes, everyone else goes to /login. */
export function RequireAuth() {
  const { loading, user } = useCurrentUser()
  if (loading) {
    return (
      <Stack sx={{ alignItems: "center", justifyContent: "center", minHeight: "100%" }}>
        <CircularProgress />
      </Stack>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <SharedScreenIdleGate />
      <Outlet />
    </>
  )
}
