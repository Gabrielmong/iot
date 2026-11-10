import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { AddComputerMutationVariables, UpdateComputerMutationVariables } from '../../gql/graphql'
import { ADD_COMPUTER, ADD_TV_BY_IP, UPDATE_COMPUTER } from './tvComputerDocuments'

const refresh = { refetchQueries: ['AdminDevices'], awaitRefetchQueries: true }

/** `add(vars)`: adds a computer by MAC (adopted at once). Rejects on failure. */
export function useAddComputer() {
  const [mutate] = useMutation(ADD_COMPUTER, refresh)
  return useCallback((variables: AddComputerMutationVariables) => mutate({ variables }), [mutate])
}

/** `update(vars)`: changes a computer's MAC or IP. Rejects on failure. */
export function useUpdateComputer() {
  const [mutate] = useMutation(UPDATE_COMPUTER, refresh)
  return useCallback((variables: UpdateComputerMutationVariables) => mutate({ variables }), [mutate])
}

/** `add(ip)`: asks each TV driver about the address and adds the TV it finds. Rejects on failure. */
export function useAddTvByIp() {
  const [mutate] = useMutation(ADD_TV_BY_IP, refresh)
  return useCallback((ip: string) => mutate({ variables: { ip } }), [mutate])
}
