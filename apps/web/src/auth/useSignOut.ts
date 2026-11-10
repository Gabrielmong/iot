import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { LOGOUT } from './documents'
import { endSession } from './sessionEvents'

/** Returns a stable `signOut`: tells the server, then always ends the local session (even if the call fails). */
export function useSignOut(): () => Promise<void> {
  const [logout] = useMutation(LOGOUT)
  return useCallback(async () => {
    try {
      await logout()
    } catch {
      // server unreachable or session already gone: still sign out locally
    } finally {
      endSession()
    }
  }, [logout])
}
