import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { ErrorLink } from '@apollo/client/link/error'

export function hasUnauthenticated(error: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED')
  )
}

/** Calls `onUnauthenticated` when any operation fails with UNAUTHENTICATED. */
export function createErrorLink(onUnauthenticated: () => void): ErrorLink {
  return new ErrorLink(({ error }) => {
    if (hasUnauthenticated(error)) onUnauthenticated()
  })
}
