import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { of } from 'rxjs'
import { computerFixture, deviceFixture } from '../../test/deviceFixtures'
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

  it("shows Didn't wake with a link to the setup checklist for admins", () => {
    const wake = { status: 'FAILED' as const, seconds: null }
    const d = { ...office(false), computer: computerFixture({ wake }) }
    setup(d, true)
    expect(screen.getByText("Didn't wake")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /check the setup checklist/i }))
    expect(screen.getByRole('button', { name: /set up wake-on-lan/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it("a regular user sees Didn't wake without the checklist link", () => {
    const wake = { status: 'FAILED' as const, seconds: null }
    setup({ ...office(false), computer: computerFixture({ wake }) })
    expect(screen.getByText("Didn't wake")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /check the setup checklist/i })).toBeNull()
  })

  it('the checklist tells admins to let the home server see the PC', () => {
    setup(office(false), true)
    fireEvent.click(screen.getByRole('button', { name: /set up wake-on-lan/i }))
    expect(screen.getByText(/Let the home server see the PC/)).toBeInTheDocument()
  })

  it('a regular user sees no setup link', () => {
    setup(office(null))
    expect(screen.queryByRole('button', { name: /set up wake-on-lan/i })).toBeNull()
  })
})
