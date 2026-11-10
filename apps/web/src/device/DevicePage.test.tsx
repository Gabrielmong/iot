import { ApolloProvider } from '@apollo/client/react'
import type { ApolloLink } from '@apollo/client/link'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { DevicePage } from '../pages/DevicePage'
import { deviceFixture, lightFixture } from '../test/deviceFixtures'
import { NEVER, Subject, throwError } from 'rxjs'
import { createTestClient, failWith, type Handler, liveSubscription, reply } from '../test/testClient'

const detailFields = {
  lastSeenAt: new Date().toISOString(),
  connection: 'LOCAL',
  streamSource: null,
  ip: null,
}

const detail = (extra: Record<string, unknown> = {}) => ({
  ...deviceFixture({ id: 'd1', name: 'Porch cam', kind: 'CAMERA', brand: 'SWANN' }),
  ...detailFields,
  model: 'SWNVK-1',
  streamSource: 'LOCAL',
  ...extra,
})

const lightDetail = (online = true) => ({ ...lightFixture({}, { id: 'd1', online }), ...detailFields })

type Entry = string | { pathname: string; state?: unknown }

function setup(device: unknown, deviceHandler: Handler = reply({ device }), extra: Record<string, Handler> = {}, entries: Entry[] = ['/devices/d1']) {
  const client = createTestClient({
    Device: deviceHandler,
    DeviceState: liveSubscription().handler,
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/devices/:id" element={<DevicePage />} />
          <Route path="/" element={<p>Dashboard home</p>} />
          <Route path="/rooms/:roomId" element={<p>Room page</p>} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
}

describe('DevicePage', () => {
  it('shows an error with Retry, not not-found, when the request fails', async () => {
    setup(null, () => throwError(() => new Error('network down')))
    expect(await screen.findByText("Couldn't load device.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Not found or no access')).not.toBeInTheDocument()
  })

  it('shows the spinner, not not-found, while loading', () => {
    setup(null, () => NEVER)
    expect(screen.getByLabelText('Loading device')).toBeInTheDocument()
    expect(screen.queryByText('Not found or no access')).not.toBeInTheDocument()
  })

  it('shows the name, room and local connection', async () => {
    setup(detail())
    expect(await screen.findByRole('heading', { name: 'Porch cam' })).toBeInTheDocument()
    const header = within(screen.getByRole('heading', { name: 'Porch cam' }).parentElement as HTMLElement)
    expect(header.getByText('Living room')).toBeInTheDocument()
    expect(header.getByText('Online')).toBeInTheDocument()
    expect(screen.getAllByText('Local (LAN)')).toHaveLength(1)
  })

  it('shows the cloud chip in the header only for cloud devices', async () => {
    setup(detail({ connection: 'CLOUD' }))
    const heading = await screen.findByRole('heading', { name: 'Porch cam' })
    expect(within(heading.parentElement as HTMLElement).getByText('via Tuya cloud')).toBeInTheDocument()
  })

  it('goes back to the room the device was opened from', async () => {
    setup(detail(), undefined, {}, ['/rooms/r2', { pathname: '/devices/d1', state: { from: '/rooms/r2' } }])
    await screen.findByRole('heading', { name: 'Porch cam' })
    const back = screen.getByRole('link', { name: 'Back to dashboard' })
    expect(back).toHaveAttribute('href', '/rooms/r2')
    fireEvent.click(back)
    expect(await screen.findByText('Room page')).toBeInTheDocument()
  })

  it('goes back to the dashboard when opened directly (a bookmark)', async () => {
    setup(detail())
    await screen.findByRole('heading', { name: 'Porch cam' })
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
  })

  it('shows not found with a link back when the device is null', async () => {
    setup(null)
    expect(await screen.findByText('Not found or no access')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
  })

  it('lists brand/model, type, room and last seen, and no address without an ip', async () => {
    setup(detail())
    const card = within(await screen.findByRole('region', { name: 'Device info' }))
    expect(card.getByText('Swann SWNVK-1')).toBeInTheDocument()
    expect(card.getByText('Camera')).toBeInTheDocument()
    expect(card.getByText('Living room')).toBeInTheDocument()
    expect(card.getByText('Just now')).toBeInTheDocument()
    expect(card.queryByText('Address')).not.toBeInTheDocument()
  })

  it('shows the address when ip is present', async () => {
    setup(detail({ ip: '192.168.1.50' }))
    const card = within(await screen.findByRole('region', { name: 'Device info' }))
    expect(card.getByText('Address')).toBeInTheDocument()
    expect(card.getByText('192.168.1.50')).toBeInTheDocument()
  })

  it('updates the light preview as soon as brightness is released, before the mutation resolves', async () => {
    const calls: unknown[] = []
    setup(lightDetail(), undefined, {
      SetDeviceState: (op) => {
        calls.push(op.variables)
        return new Subject<ApolloLink.Result>()
      },
    })
    const bulb = await screen.findByRole('img', { name: 'Light preview' })
    expect(bulb).toHaveStyle({ backgroundColor: 'rgb(109, 62, 179)' })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Brightness' }), { key: 'ArrowRight' })
    expect(calls).toEqual([{ id: 'd1', patch: { brightness: 71 } }])
    expect(await screen.findByText('Purple · 71%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Light preview' })).toHaveStyle({ backgroundColor: 'rgb(110, 63, 181)' })
  })

  it('shows the on/off preview and power switch for a plug', async () => {
    setup({ ...deviceFixture({ id: 'd1', name: 'Kettle', on: true }), ...detailFields })
    expect(await screen.findByRole('img', { name: 'Power preview' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Power' })).toBeChecked()
  })

  it('shows the same snackbar as the dashboard when a command fails', async () => {
    setup(lightDetail(), undefined, { SetDeviceState: failWith('DEVICE_UNREACHABLE') })
    fireEvent.click(await screen.findByRole('switch', { name: 'Power' }))
    expect(await screen.findByText("Couldn't reach Desk lamp")).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Power' })).toBeChecked()
  })

  it('explains and disables the controls when the device is offline, sending nothing', async () => {
    const calls: unknown[] = []
    setup(lightDetail(false), undefined, {
      SetDeviceState: (op) => {
        calls.push(op.variables)
        return NEVER
      },
    })
    expect(await screen.findByText('Offline: controls are unavailable.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Power' }))
    expect(calls).toEqual([])
  })

  it('shows the live view and no controls for a camera', async () => {
    setup(detail())
    await screen.findByRole('heading', { name: 'Porch cam' })
    expect(screen.getByRole('region', { name: 'Live view' })).toBeInTheDocument()
    expect(screen.getByLabelText('Live video')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Live preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Controls' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Cloud-streamed/)).not.toBeInTheDocument()
  })

  it('shows the cloud note on a cloud camera', async () => {
    setup(detail({ connection: 'CLOUD' }))
    expect(await screen.findByText("Cloud-streamed: won't play when the internet is down.")).toBeInTheDocument()
  })
})
