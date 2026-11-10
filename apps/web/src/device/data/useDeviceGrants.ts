import { useMutation, useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import { DEVICE_GRANTS, SET_DEVICE_GRANTS } from './documents'

/** The user ids explicitly granted this device. Always fetched fresh so the editor never starts from stale data. */
export function useDeviceGrants(deviceId: string) {
  const { data, loading, error } = useQuery(DEVICE_GRANTS, { variables: { deviceId }, fetchPolicy: 'network-only' })
  return { grantedIds: data?.deviceGrants, loading, error }
}

/** `save(deviceId, userIds)`: replaces the device's grants with exactly `userIds`. Rejects on failure. */
export function useSetDeviceGrants() {
  const [mutate] = useMutation(SET_DEVICE_GRANTS)
  return useCallback((deviceId: string, userIds: string[]) => mutate({ variables: { deviceId, userIds } }), [mutate])
}
