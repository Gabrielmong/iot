import { useQuery, useSubscription } from '@apollo/client/react'
import { DEVICE_STATE, DEVICES } from './documents'
import { useRefetchOnDevicesChanged } from './useRefetchOnDevicesChanged'

/**
 * The devices the user may see, kept live: `deviceState` events land in the cache as `Device:id`
 * (Apollo normalizes them), and `devicesChanged` refetches the list.
 */
export function useDevices() {
  const { data, loading, error } = useQuery(DEVICES, { fetchPolicy: 'cache-and-network' })
  useSubscription(DEVICE_STATE)
  useRefetchOnDevicesChanged()
  return { devices: data?.devices ?? [], loading, error }
}
