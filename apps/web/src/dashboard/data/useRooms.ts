import { useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import { ROOMS } from './documents'

/**
 * Rooms with load state. `cache-and-network` so returning to a screen after admin changes
 * shows cached rooms at once and refreshes them.
 */
export function useRoomsQuery() {
  const { data, loading, error, refetch } = useQuery(ROOMS, { fetchPolicy: 'cache-and-network' })
  const retry = useCallback(() => void refetch().catch(() => {}), [refetch])
  return { rooms: data?.rooms ?? [], loading, error, hasData: data !== undefined, retry }
}

/** All rooms (the dashboard shows only those with visible devices). */
export function useRooms() {
  return useRoomsQuery().rooms
}
