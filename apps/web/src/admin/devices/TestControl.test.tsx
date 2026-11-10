import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { of } from 'rxjs'
import { adminDeviceFixture } from '../../test/adminFixtures'
import { createTestClient, type Handler } from '../../test/testClient'
import type { AdminDevice } from '../types'
import { TestControl } from './TestControl'

const plug = adminDeviceFixture({ id: 'p1', name: 'Smart plug', testable: true })
const trial = (on: boolean) => ({
  __typename: 'DeviceTrial',
  deviceId: 'p1',
  state: { __typename: 'DeviceState', online: true, on, light: null },
})

function setup(device: AdminDevice, handlers: Record<string, Handler> = {}) {
  const calls: { op: string; vars: unknown }[] = []
  const record =
    (name: string, data: Record<string, unknown>): Handler =>
    (op) => {
      calls.push({ op: name, vars: op.variables })
      return of({ data })
    }
  const client = createTestClient({
    StartDeviceTrial: record('start', { startDeviceTrial: trial(true) }),
    SetTrialState: record('set', { setTrialState: trial(false) }),
    EndDeviceTrial: record('end', { endDeviceTrial: true }),
    ...handlers,
  })
  const view = render(
    <ApolloProvider client={client}>
      <TestControl device={device} />
    </ApolloProvider>,
  )
  return { calls, ...view }
}

describe('TestControl', () => {
  it('shows a disabled Test button with the reason when the device cannot be tested', () => {
    setup(adminDeviceFixture({ testable: false, testBlockedReason: 'Needs the Tuya key first' }))
    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled()
    expect(screen.getByText('Needs the Tuya key first')).toBeInTheDocument()
  })

  it('starts a trial and shows the real state, then switches it', async () => {
    const { calls } = setup(plug)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    const toggle = await screen.findByRole('switch', { name: 'Test Smart plug' })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    await waitFor(() => expect(calls.map((c) => c.op)).toEqual(['start', 'set']))
    expect(calls[1].vars).toEqual({ id: 'p1', on: false })
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Test Smart plug' })).not.toBeChecked())
  })

  it('ends the trial when it goes away', async () => {
    const { calls, unmount } = setup(plug)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await screen.findByRole('switch', { name: 'Test Smart plug' })
    unmount()
    await waitFor(() => expect(calls.map((c) => c.op)).toEqual(['start', 'end']))
  })

  it('shows why a trial could not start', async () => {
    setup(plug, {
      StartDeviceTrial: () => of({ errors: [{ message: 'Device is offline', extensions: { code: 'BAD_USER_INPUT' } }] }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText('Device is offline')).toBeInTheDocument()
  })

  it('offers Test again once the server has ended an idle trial', async () => {
    setup(plug, {
      SetTrialState: () => of({ errors: [{ message: 'No test running for this device', extensions: { code: 'BAD_USER_INPUT' } }] }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    fireEvent.click(await screen.findByRole('switch', { name: 'Test Smart plug' }))
    expect(await screen.findByRole('button', { name: 'Test' })).toBeEnabled()
    expect(screen.getByText('Test ended after 2 minutes. Press Test to start again.')).toBeInTheDocument()
  })
})
