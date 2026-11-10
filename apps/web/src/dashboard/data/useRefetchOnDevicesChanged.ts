import { useApolloClient, useSubscription } from '@apollo/client/react'
import { useCallback } from 'react'
import { backgroundContext } from '../../apollo'
import { DEVICES, DEVICES_CHANGED, ROOMS } from './documents'

/**
 * On `devicesChanged` (list, grant or room changes) refetch devices and rooms into the cache.
 * Background context: these refetches must not slide a shared screen's idle session.
 */
export function useRefetchOnDevicesChanged() {
  const client = useApolloClient()
  const refetch = useCallback(() => {
    for (const query of [DEVICES, ROOMS]) {
      client.query({ query, fetchPolicy: 'network-only', context: backgroundContext }).catch(() => {
        // a failed background refresh keeps the current list; the next change retries
      })
    }
  }, [client])
  useSubscription(DEVICES_CHANGED, { onData: refetch })
}
