import { useMutation, useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import type { ComputerGrantInput } from '../../gql/graphql'
import { COMPUTER_GRANTS, SET_COMPUTER_GRANTS } from './documents'

/** Each granted user's Live stats / Power actions flags for a PC; skipped for other kinds. Always fetched fresh. */
export function useComputerGrants(deviceId: string, skip: boolean) {
  const { data, error } = useQuery(COMPUTER_GRANTS, { variables: { deviceId }, fetchPolicy: 'network-only', skip })
  return { grants: skip ? [] : data?.computerGrants, error }
}

/** `save(deviceId, grants)`: sets the flags of users already granted the PC. Rejects on failure. */
export function useSetComputerGrants() {
  const [mutate] = useMutation(SET_COMPUTER_GRANTS)
  return useCallback((deviceId: string, grants: ComputerGrantInput[]) => mutate({ variables: { deviceId, grants } }), [mutate])
}
