import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { UpdateDeviceMutationVariables } from '../../gql/graphql'
import { ADD_KASA_BY_IP, REMOVE_DEVICE, SET_TUYA_LOCAL_KEY, UPDATE_DEVICE } from './documents'

const refresh = { refetchQueries: ['AdminDevices'], awaitRefetchQueries: true }

/** `update(vars)`: rename, move room or change kind. Rejects on failure. */
export function useUpdateDevice() {
  const [mutate] = useMutation(UPDATE_DEVICE, refresh)
  return useCallback((variables: UpdateDeviceMutationVariables) => mutate({ variables }), [mutate])
}

/** `remove(id)`: removes a device (a parent's outlets go with it). Rejects on failure. */
export function useRemoveDevice() {
  const [mutate] = useMutation(REMOVE_DEVICE, refresh)
  return useCallback((id: string) => mutate({ variables: { id } }), [mutate])
}

/** `setKey(deviceId, localKey)`: write-only; the key is never read back. Rejects on failure. */
export function useSetTuyaLocalKey() {
  const [mutate] = useMutation(SET_TUYA_LOCAL_KEY, refresh)
  return useCallback((deviceId: string, localKey: string) => mutate({ variables: { deviceId, localKey } }), [mutate])
}

/** `add(ip)`: probes a Kasa device at that address and adds it. Rejects on failure. */
export function useAddKasaByIp() {
  const [mutate] = useMutation(ADD_KASA_BY_IP, refresh)
  return useCallback((ip: string) => mutate({ variables: { ip } }), [mutate])
}
