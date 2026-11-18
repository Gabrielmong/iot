import { ApolloProvider } from '@apollo/client/react'
import { act, render, screen } from '@testing-library/react'
import { Observable } from 'rxjs'
import { createTestClient } from '../../../test/testClient'
import { PcStatsCard } from './PcStatsCard'

const GB = 1024 ** 3
const MB = 1024 ** 2

const sample = (extra: Record<string, unknown> = {}) => ({
  pcStats: {
    __typename: 'PcStats',
    cpu: 37,
    ramUsed: 7.8 * GB,
    ramTotal: 16 * GB,
    gpu: { __typename: 'GpuStats', name: 'RTX 3070', load: 64, tempC: 58 },
    disks: [{ __typename: 'DiskStats', mount: 'C:', free: 120 * GB, total: 476 * GB }],
    netUp: 1.2 * MB,
    netDown: 3.4 * MB,
    uptimeS: 3 * 86400 + 4 * 3600,
    user: 'Gabriel',
    idleS: 12 * 60,
    ...extra,
  },
})

function setup() {
  let subscribed = 0
  let emit: (data: Record<string, unknown>) => void = () => {}
  const client = createTestClient({
    PcStatsLive: (op) => {
      subscribed += 1
      expect(op.variables).toEqual({ deviceId: 'pc1' })
      return new Observable((sub) => {
        emit = (data) => sub.next({ data })
      })
    },
  })
  render(
    <ApolloProvider client={client}>
      <PcStatsCard deviceId="pc1" />
    </ApolloProvider>,
  )
  return { subscribed: () => subscribed, emit: (d: Record<string, unknown>) => act(() => emit(d)) }
}

describe('PcStatsCard', () => {
  it('waits for the first sample', () => {
    setup()
    expect(screen.getByText('Waiting for stats…')).toBeInTheDocument()
  })

  it('subscribes once and shows the numbers', async () => {
    const { subscribed, emit } = setup()
    emit(sample())
    expect(await screen.findByText('C: 120 GB free of 476 GB')).toBeInTheDocument()
    expect(screen.getByText('↑ 1.2 MB/s ↓ 3.4 MB/s')).toBeInTheDocument()
    expect(screen.getByText('Up 3 d 4 h')).toBeInTheDocument()
    expect(screen.getByText('Gabriel · idle 12 min')).toBeInTheDocument()
    expect(screen.getByText('7.8 GB of 16 GB')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'CPU' })).toHaveAttribute('aria-valuenow', '37')
    expect(screen.getByRole('meter', { name: 'GPU' })).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByText('RTX 3070 · 58 °C')).toBeInTheDocument()
    emit(sample({ cpu: 40 }))
    expect(screen.getByRole('meter', { name: 'CPU' })).toHaveAttribute('aria-valuenow', '40')
    expect(subscribed()).toBe(1)
  })

  it('shows no GPU gauge without a GPU, and no idle time when unknown', async () => {
    const { emit } = setup()
    emit(sample({ gpu: null, idleS: null }))
    await screen.findByRole('meter', { name: 'CPU' })
    expect(screen.queryByRole('meter', { name: 'GPU' })).not.toBeInTheDocument()
    expect(screen.getByText('Gabriel')).toBeInTheDocument()
  })
})
