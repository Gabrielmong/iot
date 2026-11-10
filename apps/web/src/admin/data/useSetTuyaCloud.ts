import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { SetTuyaCloudMutationVariables } from '../../gql/graphql'
import { SET_TUYA_CLOUD } from './documents'

export function useSetTuyaCloud() {
  const [mutate] = useMutation(SET_TUYA_CLOUD, { refetchQueries: ['Integrations'], awaitRefetchQueries: true })
  return useCallback((variables: SetTuyaCloudMutationVariables) => mutate({ variables }), [mutate])
}
