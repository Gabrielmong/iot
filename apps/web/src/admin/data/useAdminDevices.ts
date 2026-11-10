import { useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import { ADMIN_DEVICES } from './documents'

/** Every device the server knows about, adopted or not (admin view). `retry` re-runs a failed load. */
export function useAdminDevices() {
  const { data, loading, error, refetch } = useQuery(ADMIN_DEVICES, { fetchPolicy: 'cache-and-network' })
  const retry = useCallback(() => void refetch().catch(() => {}), [refetch])
  return { devices: data?.adminDevices ?? [], loading, error, hasData: data !== undefined, retry }
}
