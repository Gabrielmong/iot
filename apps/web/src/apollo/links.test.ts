import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { gql } from '@apollo/client'
import { ApolloLink } from '@apollo/client/link'
import { Observable } from 'rxjs'
import { hasUnauthenticated } from './errorLink'
import { createSplitLink } from './splitLink'
import { wsUrl } from './wsLink'

const run = (link: ApolloLink, query: ReturnType<typeof gql>) =>
  new Promise<void>((resolve) =>
    ApolloLink.execute(link, { query }, { client: undefined as never }).subscribe({ complete: resolve }),
  )

describe('apollo links', () => {
  it('routes subscriptions to ws and queries and mutations to http', async () => {
    const hits: string[] = []
    const tag = (name: string) =>
      new ApolloLink(() => new Observable((o) => { hits.push(name); o.complete() }))
    const link = createSplitLink(tag('ws'), tag('http'))
    await run(link, gql`subscription S { devicesChanged }`)
    await run(link, gql`query Q { me { id } }`)
    await run(link, gql`mutation M { logout }`)
    expect(hits).toEqual(['ws', 'http', 'http'])
  })

  it('detects UNAUTHENTICATED graphql errors only', () => {
    const make = (code: string) =>
      new CombinedGraphQLErrors({ errors: [{ message: 'x', extensions: { code } }] })
    expect(hasUnauthenticated(make('UNAUTHENTICATED'))).toBe(true)
    expect(hasUnauthenticated(make('INVALID_PIN'))).toBe(false)
    expect(hasUnauthenticated(new Error('network'))).toBe(false)
  })

  it('builds ws(s) urls from the page origin', () => {
    expect(wsUrl({ protocol: 'http:', host: 'home.lan:4000' })).toBe('ws://home.lan:4000/graphql')
    expect(wsUrl({ protocol: 'https:', host: 'home.lan' })).toBe('wss://home.lan/graphql')
  })
})
