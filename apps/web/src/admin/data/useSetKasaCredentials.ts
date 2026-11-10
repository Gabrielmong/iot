import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { SET_KASA_CREDENTIALS } from './documents'

export function useSetKasaCredentials() {
  const [mutate] = useMutation(SET_KASA_CREDENTIALS, {
    refetchQueries: ['Integrations', 'AdminDevices'],
    awaitRefetchQueries: true,
  })
  return useCallback((username: string, password: string) => mutate({ variables: { username, password } }), [mutate])
}
