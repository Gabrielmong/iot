import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { AdoptDeviceMutationVariables } from '../../gql/graphql'
import { ADOPT_DEVICE } from './documents'

/** `adopt(vars)`: adopts a discovered device, then refetches the admin device list. Rejects on failure. */
export function useAdoptDevice() {
  const [mutate] = useMutation(ADOPT_DEVICE, { refetchQueries: ['AdminDevices'], awaitRefetchQueries: true })
  return useCallback((variables: AdoptDeviceMutationVariables) => mutate({ variables }), [mutate])
}
