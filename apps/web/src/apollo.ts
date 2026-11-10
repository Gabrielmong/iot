import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloLink } from '@apollo/client/link'
import { createAuthLink } from './apollo/authLink'
import { createErrorLink } from './apollo/errorLink'
import { createHttpLink } from './apollo/httpLink'
import { createSplitLink } from './apollo/splitLink'
import { createWsClient, createWsLink } from './apollo/wsLink'
import { endSession, onSessionEnded } from './auth/sessionEvents'

/** Pass as `context` on background refetches: validates the session without sliding its expiry. */
export const backgroundContext = { headers: { 'x-home-background': '1' } } as const

export function createApolloClient(): ApolloClient {
  const wsClient = createWsClient(endSession)
  // A new login must not reuse a socket opened with the previous token.
  onSessionEnded(() => wsClient.terminate())

  const link = ApolloLink.from([
    createErrorLink(endSession),
    createAuthLink(),
    createSplitLink(createWsLink(wsClient), createHttpLink()),
  ])
  return new ApolloClient({ link, cache: new InMemoryCache() })
}
