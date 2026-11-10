import type { ApolloLink } from '@apollo/client/link'
import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { Subject } from 'rxjs'
import type { DeviceFieldsFragment } from '../gql/graphql'
import { deviceFixture, lightFixture } from '../test/deviceFixtures'
import { routineHandlers } from '../test/routineFixtures'
import { createTestClient, failWith, type Handler, liveSubscription, reply } from '../test/testClient'
import { Dashboard } from './Dashboard'

const living = { id: 'r1', name: 'Living room', sortOrder: 1 }
const kitchen = { id: 'r2', name: 'Kitchen', sortOrder: 0 }
const lamp = lightFixture({ brightness: 70 }, { id: 'lamp', name: 'Desk lamp', room: living })
const kettle = deviceFixture({ id: 'kettle', name: 'Kettle', kind: 'PLUG', on: false, room: kitchen })

function setup(devices: DeviceFieldsFragment[], extra: Record<string, Handler> = {}, path = '/rooms/all') {
  const deviceState = liveSubscription()
  const devicesChanged = liveSubscription()
  const client = createTestClient({
    Devices: reply({ devices }),
    Rooms: reply({ rooms: [living, kitchen].map((r) => ({ __typename: 'Room', ...r })) }),
    DeviceState: deviceState.handler,
    DevicesChanged: devicesChanged.handler,
    DashboardLayouts: reply({ dashboardLayouts: [] }),
    ...routineHandlers(),
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/rooms/:roomId" element={<RoomRoute />} />
          <Route path="/devices/:id" element={<DetailsProbe />} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
  return { deviceState, devicesChanged }
}

const tile = (name: string) => screen.findByRole('button', { name })

function RoomRoute() {
  return <Dashboard isAdmin={false} room={useParams().roomId!} />
}

function DetailsProbe() {
  return <p>Details page for {useParams().id}</p>
}

describe('Dashboard', () => {
  it('turns an on light off immediately and sends setDeviceState', async () => {
    const response = new Subject<ApolloLink.Result>()
    const calls: unknown[] = []
    setup([lamp], {
      SetDeviceState: (op) => {
        calls.push(op.variables)
        return response
      },
    })
    fireEvent.click(await tile('Desk lamp'))
    expect(await tile('Desk lamp')).toHaveTextContent('Off')
    expect(calls).toEqual([{ id: 'lamp', patch: { on: false } }])
    const off = lightFixture({ on: false }, { id: 'lamp', name: 'Desk lamp', room: living })
    act(() => {
      response.next({ data: { setDeviceState: off } })
      response.complete()
    })
    expect(await tile('Desk lamp')).toHaveTextContent('Off')
  })

  it('reverts and shows a snackbar when the device is unreachable', async () => {
    setup([lamp], { SetDeviceState: failWith('DEVICE_UNREACHABLE') })
    fireEvent.click(await tile('Desk lamp'))
    expect(await screen.findByText("Couldn't reach Desk lamp")).toBeInTheDocument()
    expect(await tile('Desk lamp')).toHaveTextContent('Purple · 70%')
  })

  it('turns an off light on (sends on:true, not the null state.on)', async () => {
    const calls: unknown[] = []
    const response = new Subject<ApolloLink.Result>()
    setup([lightFixture({ on: false }, { id: 'lamp', name: 'Desk lamp', room: living })], {
      SetDeviceState: (op) => {
        calls.push(op.variables)
        return response
      },
    })
    const lampTile = await tile('Desk lamp')
    expect(lampTile).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(lampTile)
    expect(await tile('Desk lamp')).toHaveTextContent('Purple · 70%')
    expect(await tile('Desk lamp')).toHaveAttribute('aria-pressed', 'true')
    expect(calls).toEqual([{ id: 'lamp', patch: { on: true } }])
  })

  it('shows a deviceState event that arrived while a failed toggle was in flight', async () => {
    const response = new Subject<ApolloLink.Result>()
    const { deviceState } = setup([lamp], { SetDeviceState: () => response })
    fireEvent.click(await tile('Desk lamp'))
    expect(await tile('Desk lamp')).toHaveTextContent('Off')
    act(() => deviceState.next({ deviceState: lightFixture({ brightness: 25 }, { id: 'lamp', name: 'Desk lamp', room: living }) }))
    act(() => {
      response.next({ errors: [{ message: 'DEVICE_UNREACHABLE', extensions: { code: 'DEVICE_UNREACHABLE' } }] })
      response.complete()
    })
    expect(await screen.findByText("Couldn't reach Desk lamp")).toBeInTheDocument()
    expect(await tile('Desk lamp')).toHaveTextContent('Purple · 25%')
  })

  it('re-renders a tile when a deviceState event changes brightness', async () => {
    const { deviceState } = setup([lamp])
    expect(await tile('Desk lamp')).toHaveTextContent('Purple · 70%')
    act(() => deviceState.next({ deviceState: lightFixture({ brightness: 40 }, { id: 'lamp', name: 'Desk lamp', room: living }) }))
    expect(await screen.findByText('Purple · 40%')).toBeInTheDocument()
  })

  it('refetches devices in the background when devicesChanged fires', async () => {
    const contexts: unknown[] = []
    let devices = [lamp]
    const { devicesChanged } = setup([], {
      Devices: (op) => {
        contexts.push(op.getContext().headers)
        return reply({ devices })(op)
      },
    })
    await tile('Desk lamp')
    devices = [lamp, kettle]
    act(() => devicesChanged.next({ devicesChanged: true }))
    expect(await tile('Kettle')).toBeInTheDocument()
    expect(contexts.at(-1)).toEqual({ 'x-home-background': '1' })
  })

  it('refetches from the network when the dashboard is shown again over cached data', async () => {
    let requests = 0
    const client = createTestClient({
      Devices: (op) => {
        requests += 1
        return reply({ devices: [lamp] })(op)
      },
      Rooms: reply({ rooms: [living, kitchen].map((r) => ({ __typename: 'Room', ...r })) }),
      DeviceState: liveSubscription().handler,
      DevicesChanged: liveSubscription().handler,
    })
    const view = () => (
      <ApolloProvider client={client}>
        <MemoryRouter>
          <Dashboard isAdmin={false} room="all" />
        </MemoryRouter>
      </ApolloProvider>
    )
    const first = render(view())
    await tile('Desk lamp')
    first.unmount()
    render(view())
    await tile('Desk lamp')
    await vi.waitFor(() => expect(requests).toBe(2))
  })

  it('shows only the room in the URL, under its name', async () => {
    setup([lamp, kettle], {}, '/rooms/r2')
    expect(await screen.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument()
    expect(await tile('Kettle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desk lamp' })).not.toBeInTheDocument()
  })

  it('shows strip outlets individually and hides the strip', async () => {
    const strip = deviceFixture({ id: 'strip', name: 'Power strip', room: kitchen })
    const outlet = deviceFixture({ id: 'o1', name: 'Coffee', parentId: 'strip', room: kitchen })
    setup([strip, outlet])
    expect(await tile('Coffee')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Power strip' })).not.toBeInTheDocument()
  })

  it('opens the details page from ⋯ without a dialog or a toggle', async () => {
    const calls: unknown[] = []
    setup([lamp], {
      SetDeviceState: (op) => {
        calls.push(op.variables)
        return reply({ setDeviceState: lamp })(op)
      },
    })
    fireEvent.click(await tile('More controls for Desk lamp'))
    expect(await screen.findByText('Details page for lamp')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('opens the details page when a camera tile is tapped', async () => {
    setup([deviceFixture({ id: 'cam', name: 'Door cam', kind: 'CAMERA', room: living })])
    fireEvent.click(await tile('Door cam'))
    expect(await screen.findByText('Details page for cam')).toBeInTheDocument()
  })
})

describe('Dashboard layouts', () => {
  const tileNames = () => screen.getAllByRole('button', { name: /^(Desk lamp|Kettle)$/ }).map((b) => b.getAttribute('aria-label'))
  const layouts = (items: { deviceId: string; size: string }[]) =>
    reply({
      dashboardLayouts: [
        { __typename: 'DashboardLayout', tab: 'all', isDefault: false, items: items.map((i) => ({ __typename: 'LayoutItem', ...i })) },
      ],
    })

  it('shows tiles in the saved order for the tab', async () => {
    setup([lamp, kettle], { DashboardLayouts: layouts([{ deviceId: 'kettle', size: 'L2x2' }, { deviceId: 'lamp', size: 'S1x1' }]) })
    await tile('Desk lamp')
    await vi.waitFor(() => expect(tileNames()).toEqual(['Kettle', 'Desk lamp']))
  })

  it('keeps server order when the tab has no layout', async () => {
    setup([lamp, kettle])
    await tile('Kettle')
    expect(tileNames()).toEqual(['Desk lamp', 'Kettle'])
  })
})

describe('Dashboard all off', () => {
  const sofaLight = deviceFixture({ id: 'sofa', name: 'Sofa light', kind: 'SWITCH', on: true, room: living })
  const toaster = deviceFixture({ id: 'toaster', name: 'Toaster', kind: 'PLUG', on: true, room: kitchen })

  function setupWithCalls(devices: DeviceFieldsFragment[], path?: string) {
    const calls: unknown[] = []
    setup(
      devices,
      {
        SetDeviceState: (op) => {
          calls.push(op.variables)
          return new Subject<ApolloLink.Result>()
        },
      },
      path,
    )
    return calls
  }

  it('turns off every on device in the selected room only', async () => {
    const calls = setupWithCalls([lamp, sofaLight, toaster, kettle], '/rooms/r1')
    fireEvent.click(await screen.findByRole('button', { name: 'All off' }))
    expect(calls).toEqual([
      { id: 'lamp', patch: { on: false } },
      { id: 'sofa', patch: { on: false } },
    ])
    expect(await tile('Desk lamp')).toHaveTextContent('Off')
  })

  it('turns off everything on the All tab', async () => {
    const calls = setupWithCalls([lamp, toaster, kettle])
    fireEvent.click(await screen.findByRole('button', { name: 'All off' }))
    expect(calls).toEqual([
      { id: 'lamp', patch: { on: false } },
      { id: 'toaster', patch: { on: false } },
    ])
  })

  it('is disabled when nothing in the tab is on', async () => {
    setupWithCalls([lamp, kettle], '/rooms/r2')
    expect(await screen.findByRole('button', { name: 'All off' })).toBeDisabled()
  })
})
