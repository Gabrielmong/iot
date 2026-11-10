import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { CREATE_ROOM, DELETE_ROOM, UPDATE_ROOM } from './documents'

// `Rooms` is the dashboard query; admin devices embed room names, so refetch both.
const refresh = { refetchQueries: ['Rooms', 'AdminDevices'], awaitRefetchQueries: true }

export function useCreateRoom() {
  const [mutate] = useMutation(CREATE_ROOM, refresh)
  return useCallback((name: string) => mutate({ variables: { name } }), [mutate])
}

export function useUpdateRoom() {
  const [mutate] = useMutation(UPDATE_ROOM, refresh)
  return useCallback(
    (id: string, changes: { name?: string; sortOrder?: number }) => mutate({ variables: { id, ...changes } }),
    [mutate],
  )
}

/** Devices in a deleted room become unassigned (server side). */
export function useDeleteRoom() {
  const [mutate] = useMutation(DELETE_ROOM, refresh)
  return useCallback((id: string) => mutate({ variables: { id } }), [mutate])
}
