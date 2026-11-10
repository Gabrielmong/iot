import { SetContextLink } from '@apollo/client/link/context'
import { getToken } from '../auth/session'

/** Adds `Authorization: Bearer <token>` to HTTP requests when signed in. */
export function createAuthLink(): SetContextLink {
  return new SetContextLink(({ headers }) => {
    const token = getToken()
    return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } }
  })
}
