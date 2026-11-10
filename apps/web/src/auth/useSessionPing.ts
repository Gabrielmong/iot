import { useApolloClient } from '@apollo/client/react'
import { useCallback } from 'react'
import { ME } from './documents'

/**
 * Returns a stable `ping` that asks the server for `me` as a normal (user-initiated) request, which
 * slides a shared session's idle expiry. Failures are ignored; an ended session is handled globally.
 */
export function useSessionPing(): () => void {
  const client = useApolloClient()
  return useCallback(() => {
    client.query({ query: ME, fetchPolicy: 'network-only' }).catch(() => {
      // offline or session already gone: the error link / next request deals with it
    })
  }, [client])
}
