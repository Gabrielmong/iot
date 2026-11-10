import { useApolloClient, useQuery, useSubscription } from '@apollo/client/react'
import { useCallback } from 'react'
import { backgroundContext } from '../../apollo'
import { TRY_ID } from '../types'
import { ROUTINE_LAST_RUN, ROUTINE_RUN_CHANGED, ROUTINES, ROUTINES_CHANGED } from './documents'

/**
 * The caller's routines (own + shared they can see), kept live: run events land in each routine's
 * cached `lastRun`, and `routinesChanged` refetches the list in the background.
 */
export function useRoutines() {
  const client = useApolloClient()
  const { data, loading } = useQuery(ROUTINES, { fetchPolicy: 'cache-and-network' })
  const refetch = useCallback(() => {
    client.query({ query: ROUTINES, fetchPolicy: 'network-only', context: backgroundContext }).catch(() => {
      // keep the current list; the next change retries
    })
  }, [client])
  useSubscription(ROUTINES_CHANGED, { onData: refetch })
  useSubscription(ROUTINE_RUN_CHANGED, {
    onData: ({ data: { data: event } }) => {
      const change = event?.routineRunChanged
      if (!change || change.routineId === TRY_ID) return
      client.cache.writeFragment({
        id: client.cache.identify({ __typename: 'Routine', id: change.routineId }),
        fragment: ROUTINE_LAST_RUN,
        fragmentName: 'RoutineLastRun',
        data: { lastRun: change.run },
      })
    },
  })
  return { routines: data?.routines ?? [], loading }
}
