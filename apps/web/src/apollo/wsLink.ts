import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { createClient, type Client } from 'graphql-ws'
import { getToken } from '../auth/session'
import { GRAPHQL_PATH } from './httpLink'

/** Server closes the socket with this code when the session is invalid or expired. */
export const SESSION_CLOSE_CODE = 4401

const closeCode = (e: unknown): number | undefined => (e as { code?: number } | null)?.code

export function wsUrl(loc: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${GRAPHQL_PATH}`
}

export function createWsClient(onSessionClosed: () => void): Client {
  return createClient({
    url: wsUrl(),
    lazy: true,
    connectionParams: () => ({ authToken: getToken() }),
    shouldRetry: (e) => closeCode(e) !== SESSION_CLOSE_CODE,
    on: {
      closed: (e) => {
        if (closeCode(e) === SESSION_CLOSE_CODE) onSessionClosed()
      },
    },
  })
}

export const createWsLink = (client: Client): GraphQLWsLink => new GraphQLWsLink(client)
