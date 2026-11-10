import { useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import { USERS } from './documents'

export function useUsers() {
  const { data, loading, error, refetch } = useQuery(USERS, { fetchPolicy: 'cache-and-network' })
  const retry = useCallback(() => void refetch().catch(() => {}), [refetch])
  return { users: data?.users ?? [], loading, error, hasData: data !== undefined, retry }
}
