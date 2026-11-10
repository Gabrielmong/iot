import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { of } from 'rxjs'
import { deviceFixture } from '../../test/deviceFixtures'
import { createTestClient } from '../../test/testClient'
import type { DeviceDetail } from '../types'
import { ComputerCard } from './ComputerCard'

const office = (on: boolean | null) =>
  ({
    ...deviceFixture({ id: 'pc1', name: 'Office PC', kind: 'COMPUTER', brand: 'WOL', on }),
    lastSeenAt: null,
    streamSource: null,
    ip: on === null ? null : '192.168.0.50',
  }) as DeviceDetail

function setup(device: DeviceDetail, isAdmin = false) {
  const calls: unknown[] = []
  const client = createTestClient({
    SetDeviceState: (op) => {
      calls.push(op.variables)
      return of({ data: { setDeviceState: device } })
    },
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <ComputerCard device={device} isAdmin={isAdmin} />
      </MemoryRouter>
    </ApolloProvider>,
  )
  return calls
}

describe('ComputerCard', () => {
  it('Wake sends setDeviceState on: true', async () => {
    const calls = setup(office(false))
    expect(screen.getByText('Off')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wake' }))
    await act(async () => {})
    expect(calls).toEqual([{ id: 'pc1', patch: { on: true } }])
  })

  it('shows On when awake, and the setup checklist link only to admins', () => {
    setup(office(true), true)
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set up wake-on-lan/i })).toBeInTheDocument()
  })

  it('a regular user sees no setup link', () => {
    setup(office(null))
    expect(screen.queryByRole('button', { name: /set up wake-on-lan/i })).toBeNull()
  })
})
