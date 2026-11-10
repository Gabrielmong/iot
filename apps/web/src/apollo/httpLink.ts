import { HttpLink } from '@apollo/client/link/http'

export const GRAPHQL_PATH = '/graphql'

/** Queries and mutations always go over HTTP, same origin. */
export const createHttpLink = (): HttpLink => new HttpLink({ uri: GRAPHQL_PATH })
