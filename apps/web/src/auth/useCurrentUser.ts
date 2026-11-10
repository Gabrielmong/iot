import { useQuery } from '@apollo/client/react'
import { ME } from './documents'
import { getToken } from './session'

/** The signed-in user. `me` throws UNAUTHENTICATED when signed out, so an error means logged out. */
export function useCurrentUser() {
  const hasToken = getToken() !== null
  const { data, loading, error } = useQuery(ME, { skip: !hasToken })
  return {
    hasToken,
    loading: hasToken && loading,
    user: !error && data?.me ? data.me : null,
  }
}
