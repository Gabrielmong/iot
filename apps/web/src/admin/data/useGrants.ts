import { useMutation, useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import { GRANTS, SET_GRANTS } from './documents'

/** The device ids granted to a user. Always fetched fresh so the editor never starts from stale data. */
export function useGrants(userId: string, skip = false) {
  const { data, loading, error } = useQuery(GRANTS, { variables: { userId }, fetchPolicy: 'network-only', skip })
  return { grantedIds: data?.grants, loading, error }
}

/** `save(userId, deviceIds)`: replaces the user's grants with exactly `deviceIds`. Rejects on failure. */
export function useSetGrants() {
  const [mutate] = useMutation(SET_GRANTS)
  return useCallback((userId: string, deviceIds: string[]) => mutate({ variables: { userId, deviceIds } }), [mutate])
}
