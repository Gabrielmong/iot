import { useApolloClient, useQuery, useSubscription } from '@apollo/client/react'
import { useCallback } from 'react'
import { backgroundContext } from '../../apollo'
import { CAMERA_GROUPS, CAMERA_GROUPS_CHANGED, OTHER_CAMERA_GROUPS } from './documents'

/**
 * The caller's camera groups (`mine`, `shared`) and, for admins, other users' personal ones (`others`),
 * refetched in the background whenever any group changes.
 */
export function useCameraGroups(isAdmin: boolean) {
  const client = useApolloClient()
  const { data, loading } = useQuery(CAMERA_GROUPS, { fetchPolicy: 'cache-and-network' })
  const others = useQuery(OTHER_CAMERA_GROUPS, { skip: !isAdmin, fetchPolicy: 'cache-and-network' }).data?.otherCameraGroups ?? []
  const refetch = useCallback(() => {
    const queries = isAdmin ? [CAMERA_GROUPS, OTHER_CAMERA_GROUPS] : [CAMERA_GROUPS]
    for (const query of queries) {
      client.query({ query, fetchPolicy: 'network-only', context: backgroundContext }).catch(() => {
        // keep the current list; the next change retries
      })
    }
  }, [client, isAdmin])
  useSubscription(CAMERA_GROUPS_CHANGED, { onData: refetch })
  const groups = data?.cameraGroups ?? []
  return {
    mine: groups.filter((g) => g.scope === 'PERSONAL'),
    shared: groups.filter((g) => g.scope === 'SHARED'),
    others,
    loading: loading && !data,
  }
}
