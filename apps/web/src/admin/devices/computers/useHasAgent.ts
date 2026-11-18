import { useQuery } from '@apollo/client/react'
import { DEVICES } from '../../../dashboard/data/documents'

/** Whether the device is a PC with a HomeAgent, from the devices list (cached when the dashboard loaded it). */
export function useHasAgent(deviceId: string): boolean {
  const { data } = useQuery(DEVICES, { fetchPolicy: 'cache-first' })
  return Boolean(data?.devices.find((d) => d.id === deviceId)?.computer?.agent)
}
