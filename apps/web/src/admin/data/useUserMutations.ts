import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { CreateUserMutationVariables, UpdateUserMutationVariables } from '../../gql/graphql'
import { CREATE_USER, DELETE_USER, UPDATE_USER } from './documents'

const refresh = { refetchQueries: ['Users'], awaitRefetchQueries: true }

/** For actions that end the caller's own session: refetching would only hit UNAUTHENTICATED. */
export type RefetchOption = { refetch?: boolean }
const refreshFor = ({ refetch = true }: RefetchOption = {}) =>
  refetch ? refresh : { refetchQueries: [] as string[], awaitRefetchQueries: false }

export function useCreateUser() {
  const [mutate] = useMutation(CREATE_USER, refresh)
  return useCallback((variables: CreateUserMutationVariables) => mutate({ variables }), [mutate])
}

export function useUpdateUser() {
  const [mutate] = useMutation(UPDATE_USER, refresh)
  return useCallback(
    (variables: UpdateUserMutationVariables, option?: RefetchOption) => mutate({ variables, ...refreshFor(option) }),
    [mutate],
  )
}

export function useDeleteUser() {
  const [mutate] = useMutation(DELETE_USER, refresh)
  return useCallback((id: string, option?: RefetchOption) => mutate({ variables: { id }, ...refreshFor(option) }), [mutate])
}
