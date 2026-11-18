import { ApolloProvider } from '@apollo/client/react'
import { render, screen } from '@testing-library/react'
import { of } from 'rxjs'
import { computerFixture, deviceFixture } from '../../../test/deviceFixtures'
import { createTestClient } from '../../../test/testClient'
import type { DeviceDetail } from '../../types'
import { PowerHistoryCard } from './PowerHistoryCard'

const pc = (confirmable: boolean) =>
  ({
    ...deviceFixture({ id: 'pc1', name: 'Office PC', kind: 'COMPUTER', brand: 'WOL', on: true, computer: computerFixture({ confirmable }) }),
    lastSeenAt: null,
    streamSource: null,
    ip: null,
  }) as DeviceDetail

function setup(device: DeviceDetail) {
  const calls: unknown[] = []
  const at = new Date(Date.now() - 3600_000).toISOString()
  const client = createTestClient({
    PowerHistory: (op) => {
      calls.push(op.variables)
      return of({ data: { device: { __typename: 'Device', id: 'pc1', powerHistory: [{ __typename: 'PowerEvent', on: true, at }] } } })
    },
  })
  render(
    <ApolloProvider client={client}>
      <PowerHistoryCard device={device} />
    </ApolloProvider>,
  )
  return calls
}

describe('PowerHistoryCard', () => {
  it('explains why an unconfirmable PC has no history', () => {
    const calls = setup(pc(false))
    expect(screen.getByText(/History needs the server to reach this PC/)).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('shows the summary and the timeline for a confirmable PC', async () => {
    setup(pc(true))
    expect(await screen.findByText(/^On since/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /on\/off timeline/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '24 h' })).toHaveAttribute('aria-pressed', 'true')
  })
})
