import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { of } from 'rxjs'
import type { TvApp } from '../../gql/graphql'
import { deviceFixture } from '../../test/deviceFixtures'
import { createTestClient, failWith, type Handler } from '../../test/testClient'
import type { DeviceDetail } from '../types'
import { TvRemoteCard } from './TvRemoteCard'

type TvOpts = { on?: boolean; apps?: TvApp[]; canPowerOn?: boolean }

const tele = ({ on = true, apps = ['YOUTUBE', 'NETFLIX'], canPowerOn = true }: TvOpts = {}) =>
  ({
    ...deviceFixture({ id: 'tv1', name: 'Tele cuarto', kind: 'TV', brand: 'SAMSUNG', on }),
    tv: { __typename: 'TvInfo', apps, canPowerOn },
    lastSeenAt: null,
    streamSource: null,
    ip: '192.168.0.235',
  }) as DeviceDetail

function setup(device: DeviceDetail, over: Record<string, Handler> = {}) {
  const calls: Record<string, unknown[]> = { key: [], app: [], state: [] }
  const record = (name: string, data: Record<string, unknown>): Handler => (op) => {
    calls[name]!.push(op.variables)
    return of({ data })
  }
  const client = createTestClient({
    SendTvKey: record('key', { sendTvKey: true }),
    LaunchTvApp: record('app', { launchTvApp: true }),
    SetDeviceState: record('state', { setDeviceState: device }),
    ...over,
  })
  render(
    <ApolloProvider client={client}>
      <TvRemoteCard device={device} />
    </ApolloProvider>,
  )
  return calls
}

const press = (name: string) => {
  const button = screen.getByRole('button', { name })
  fireEvent.pointerDown(button)
  fireEvent.pointerUp(button)
  fireEvent.click(button, { detail: 1 })
}

describe('TvRemoteCard', () => {
  afterEach(() => vi.useRealTimers())

  it('pressing OK sends OK once', async () => {
    const calls = setup(tele())
    press('OK')
    await act(async () => {})
    expect(calls.key).toEqual([{ deviceId: 'tv1', key: 'OK' }])
  })

  it('holding volume up repeats every 200 ms; holding OK does not', async () => {
    vi.useFakeTimers()
    const calls = setup(tele())
    const up = screen.getByRole('button', { name: 'Volume up' })
    fireEvent.pointerDown(up)
    await act(async () => void vi.advanceTimersByTime(650))
    fireEvent.pointerUp(up)
    const ok = screen.getByRole('button', { name: 'OK' })
    fireEvent.pointerDown(ok)
    await act(async () => void vi.advanceTimersByTime(650))
    fireEvent.pointerUp(ok)
    expect(calls.key.map((c) => (c as { key: string }).key)).toEqual(['VOLUME_UP', 'VOLUME_UP', 'VOLUME_UP', 'VOLUME_UP', 'OK'])
  })

  it('shows only the TV’s apps and launches one', async () => {
    const calls = setup(tele({ apps: ['YOUTUBE', 'NETFLIX'] }))
    expect(screen.queryByRole('button', { name: 'Spotify' })).toBeNull()
    expect(screen.getByRole('button', { name: 'YouTube' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Netflix' }))
    await act(async () => {})
    expect(calls.app).toEqual([{ deviceId: 'tv1', app: 'NETFLIX' }])
  })

  it('says the TV isn’t answering when it is unreachable', async () => {
    setup(tele(), { SendTvKey: failWith('DEVICE_UNREACHABLE') })
    press('Home')
    expect(await screen.findByText('Tele cuarto isn’t answering')).toBeInTheDocument()
  })

  it('power turns the TV off through setDeviceState', async () => {
    const calls = setup(tele({ on: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    await act(async () => {})
    expect(calls.state).toEqual([{ id: 'tv1', patch: { on: false } }])
  })

  it('an off TV that can’t be woken has a disabled power button and says why', () => {
    setup(tele({ on: false, canPowerOn: false }))
    expect(screen.getByRole('button', { name: 'Power' })).toBeDisabled()
    expect(screen.getByText('This TV can only be turned off from the app')).toBeInTheDocument()
  })
})
