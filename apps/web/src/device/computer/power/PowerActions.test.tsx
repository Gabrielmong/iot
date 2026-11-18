import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { of } from 'rxjs'
import { computerFixture, deviceFixture } from '../../../test/deviceFixtures'
import { createTestClient, liveSubscription } from '../../../test/testClient'
import type { DeviceDetail } from '../../types'
import { PowerActions } from './PowerActions'

const pc = (canPower: boolean, connected: boolean | null) =>
  ({
    ...deviceFixture({
      id: 'pc1',
      name: 'Office PC',
      kind: 'COMPUTER',
      brand: 'WOL',
      on: true,
      computer: computerFixture({ canPower, agent: connected === null ? null : { connected, version: 1001 } }),
    }),
    lastSeenAt: null,
    streamSource: null,
    ip: null,
  }) as DeviceDetail

const state = (phase: string, secondsLeft: number | null = null) => ({
  __typename: 'PcPowerState',
  id: 'p1',
  deviceId: 'pc1',
  action: 'RESTART',
  phase,
  secondsLeft,
  requestedBy: 'Ana',
})

function setup(device: DeviceDetail) {
  const calls: { op: string; vars: unknown }[] = []
  const live = liveSubscription()
  const client = createTestClient({
    PcPower: (op) => {
      calls.push({ op: 'power', vars: op.variables })
      return of({ data: { pcPower: state('SENT') } })
    },
    PcPowerCancel: (op) => {
      calls.push({ op: 'cancel', vars: op.variables })
      return of({ data: { pcPowerCancel: true } })
    },
    PcPowerStateChanged: live.handler,
  })
  render(
    <ApolloProvider client={client}>
      <PowerActions device={device} />
    </ApolloProvider>,
  )
  return { calls, live }
}

describe('PowerActions', () => {
  it.each([
    ['without the Power permission', pc(false, true)],
    ['with the agent offline', pc(true, false)],
    ['without an agent', pc(true, null)],
  ])('is hidden %s', (_, device) => {
    setup(device)
    expect(screen.queryByRole('button', { name: 'Restart' })).not.toBeInTheDocument()
  })

  it('shows Sleep, Shut down and Restart', () => {
    setup(pc(true, true))
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sleep', 'Shut down', 'Restart'])
  })

  it('Restart asks to confirm, then sends the request', async () => {
    const { calls } = setup(pc(true, true))
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Restart Office PC?' }))
    expect(dialog.getByText('Anyone using it gets a 60 s warning.')).toBeInTheDocument()
    expect(calls).toEqual([])
    fireEvent.click(dialog.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(calls).toEqual([{ op: 'power', vars: { deviceId: 'pc1', action: 'RESTART' } }]))
    expect(await screen.findByText('Asking the PC to restart…')).toBeInTheDocument()
  })

  it('during the countdown, Cancel cancels the request', async () => {
    const { calls, live } = setup(pc(true, true))
    act(() => live.next({ pcPowerState: state('COUNTDOWN', 45) }))
    expect(await screen.findByText('Restarting in 45 s… (someone at the PC can cancel)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(calls).toEqual([{ op: 'cancel', vars: { deviceId: 'pc1', id: 'p1' } }]))
  })
})
