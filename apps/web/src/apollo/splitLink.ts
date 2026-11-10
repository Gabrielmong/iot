import { ApolloLink } from '@apollo/client/link'

/** Subscriptions go to `ws`; everything else (queries, mutations) to `http`. */
export function createSplitLink(ws: ApolloLink, http: ApolloLink): ApolloLink {
  return ApolloLink.split(
    ({ query }) =>
      query.definitions.some((d) => d.kind === 'OperationDefinition' && d.operation === 'subscription'),
    ws,
    http,
  )
}
