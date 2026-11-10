import { useQuery, useSubscription } from '@apollo/client/react'
import { DEVICE_STATE } from '../../dashboard/data/documents'
import { DEVICE } from './documents'

/** One device, kept live: `deviceState` events update the normalised `Device:id` this query reads. */
export function useDevice(id: string) {
  const { data, loading, error, refetch } = useQuery(DEVICE, { variables: { id }, fetchPolicy: 'cache-and-network' })
  useSubscription(DEVICE_STATE)
  return { /** undefined until a result arrives; null when the server says not found or no access. */
    device: data?.device, loading, error, refetch }
}
