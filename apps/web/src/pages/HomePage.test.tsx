import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { NEVER, of } from 'rxjs'
import { AppRoutes } from '../AppRoutes'
import { setToken } from '../auth/session'
import type { DeviceFieldsFragment } from '../gql/graphql'
import { deviceFixture } from '../test/deviceFixtures'
import { routineFixture, routineHandlers } from '../test/routineFixtures'
import { stubWidth } from '../test/stubWidth'
import { createTestClient, failWith, liveSubscription, reply, type Handler } from '../test/testClient'
import { emptyWeather, weatherFixture } from '../test/weatherFixtures'

const living = { id: 'r1', name: 'Living room', sortOrder: 1 }
const kitchen = { id: 'r2', name: 'Kitchen', sortOrder: 0 }
const garage = { id: 'r3', name: 'Garage', sortOrder: 2 }
const devices: DeviceFieldsFragment[] = [
  deviceFixture({ id: 'kettle', name: 'Kettle', kind: 'PLUG', on: true, room: kitchen }),
  deviceFixture({ id: 'tv-plug', name: 'TV plug', kind: 'PLUG', on: true, room: living }),
]

const item = (over: Record<string, unknown>) => ({ __typename: 'LayoutItem', deviceId: null, widget: null, widgetId: null, targetId: null, size: 'S1x1', ...over })
const homeLayout = (items: unknown[]) => ({ __typename: 'DashboardLayout', tab: 'home', isDefault: false, items })

type Opts = { layouts?: unknown[]; layoutsHandler?: Handler; weather?: unknown; setState?: unknown[]; routines?: ReturnType<typeof routineFixture>[] }

function renderAt(path: string, { layouts = [], layoutsHandler, weather = emptyWeather('NOT_CONFIGURED'), setState = [], routines = [] }: Opts = {}) {
  setToken('t')
  const client = createTestClient({
    Me: reply({ me: { __typename: 'User', id: 'u1', name: 'Alice', avatarColor: '#43a047', avatarImage: null, role: 'USER', hasPin: true } }),
    HomeName: reply({ homeName: 'The Cabin' }),
    Devices: reply({ devices }),
    Rooms: reply({ rooms: [living, kitchen, garage].map((r) => ({ __typename: 'Room', ...r })) }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
    DashboardLayouts: layoutsHandler ?? reply({ dashboardLayouts: layouts }),
    Weather: reply({ weather }),
    WeatherUpdated: liveSubscription().handler,
    SetDeviceState: (op) => {
      setState.push(op.variables)
      return of({ data: { setDeviceState: devices[0] } })
    },
    ...routineHandlers(routines),
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ApolloProvider>,
  )
}

const main = async () => within(await screen.findByRole('main'))

afterEach(() => vi.unstubAllGlobals())

describe('Home', () => {
  beforeEach(() => stubWidth(true))

  it('shows only what was put on Home, under "Home", with Edit Home', async () => {
    renderAt('/', { layouts: [homeLayout([item({ deviceId: 'kettle' })])] })
    const page = await main()
    expect(await page.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(await page.findByRole('button', { name: 'Kettle' })).toBeInTheDocument()
    expect(page.queryByRole('button', { name: 'TV plug' })).not.toBeInTheDocument()
    expect(page.getByRole('button', { name: 'Edit Home' })).toBeInTheDocument()
  })

  it('is empty until something is added, and Add to Home starts arranging', async () => {
    renderAt('/')
    const page = await main()
    expect(await page.findByText('Nothing on Home yet')).toBeInTheDocument()
    expect(page.queryByRole('button', { name: 'Kettle' })).not.toBeInTheDocument()
    fireEvent.click(page.getByRole('button', { name: 'Add to Home' }))
    expect(await page.findByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('waits for the saved Home instead of showing it empty', async () => {
    renderAt('/', { layoutsHandler: () => NEVER })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('Nothing on Home yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to Home' })).not.toBeInTheDocument()
  })

  it("says so when the saved Home can't be loaded, and offers no Add to Home", async () => {
    renderAt('/', { layoutsHandler: failWith('INTERNAL') })
    expect(await screen.findByText("Couldn't load your Home.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to Home' })).not.toBeInTheDocument()
  })

  it('hides a room widget for a room with nothing this viewer can see', async () => {
    renderAt('/', { layouts: [homeLayout([item({ deviceId: 'kettle' }), item({ widget: 'ROOM', widgetId: 'g', targetId: 'r3', size: 'S1x1' }), item({ widget: 'ROOM', widgetId: 'k', targetId: 'r2', size: 'S1x1' })])] })
    const page = await main()
    expect((await page.findAllByText('Kitchen')).length).toBeGreaterThan(0)
    expect(page.queryByText('Garage')).not.toBeInTheDocument()
  })

  it('has no routine row, and All off only switches off the devices on Home', async () => {
    const setState: unknown[] = []
    renderAt('/', { layouts: [homeLayout([item({ deviceId: 'kettle' })])], setState, routines: [routineFixture()] })
    const page = await main()
    await page.findByRole('button', { name: 'Kettle' })
    expect(page.queryByRole('group', { name: 'Routines' })).not.toBeInTheDocument()
    fireEvent.click(page.getByRole('button', { name: 'All off' }))
    await vi.waitFor(() => expect(setState).toEqual([{ id: 'kettle', patch: { on: false } }]))
  })
})

describe('Editing Home', () => {
  beforeEach(() => stubWidth(true))

  it('adds a device from any room and removes one from the draft only', async () => {
    renderAt('/', { layouts: [homeLayout([item({ deviceId: 'kettle' })])] })
    const page = await main()
    await page.findByRole('button', { name: 'Kettle' })
    fireEvent.click(page.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(await page.findByRole('button', { name: 'Add device' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'TV plug' }))
    expect(await page.findByRole('button', { name: 'Move TV plug' })).toBeInTheDocument()
    fireEvent.click(page.getByRole('button', { name: 'Remove Kettle from Home' }))
    expect(page.queryByRole('button', { name: 'Move Kettle' })).not.toBeInTheDocument()
    fireEvent.click(page.getByRole('button', { name: 'Cancel' }))
    expect(await page.findByRole('button', { name: 'Kettle' })).toBeInTheDocument()
    expect(page.queryByRole('button', { name: 'TV plug' })).not.toBeInTheDocument()
  })
})

describe('Pages and redirects', () => {
  it('/rooms/all lands on All devices', async () => {
    stubWidth(true)
    renderAt('/rooms/all')
    const page = await main()
    expect(await page.findByRole('heading', { name: 'All devices' })).toBeInTheDocument()
    expect(await page.findByRole('button', { name: 'TV plug' })).toBeInTheDocument()
  })

  it('/rooms on a computer lands on All devices', async () => {
    stubWidth(true)
    renderAt('/rooms')
    expect(await (await main()).findByRole('heading', { name: 'All devices' })).toBeInTheDocument()
  })

  it('/rooms on a phone shows the room grid, and a room goes back to it', async () => {
    stubWidth(false)
    renderAt('/rooms')
    const page = await main()
    const rooms = within(await page.findByRole('list', { name: 'Rooms' }))
    expect(rooms.getByRole('link', { name: /All devices/ })).toHaveAttribute('href', '/all')
    fireEvent.click(rooms.getByRole('link', { name: /Kitchen/ }))
    expect(await page.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument()
    expect(page.getByRole('link', { name: 'Back to rooms' })).toHaveAttribute('href', '/rooms')
  })
})

describe('Home on a phone', () => {
  beforeEach(() => stubWidth(false))

  it('shows the weather strip at the top', async () => {
    renderAt('/', { weather: weatherFixture(), layouts: [homeLayout([item({ deviceId: 'kettle' })])] })
    const page = await main()
    await page.findByRole('button', { name: 'Kettle' })
    expect(page.getByRole('link', { name: /Partly cloudy|°/ })).toHaveAttribute('href', '/weather')
  })

  it('leaves the strip out when Home has a weather widget', async () => {
    renderAt('/', { weather: weatherFixture(), layouts: [homeLayout([item({ widget: 'WEATHER', widgetId: 'w1', size: 'W2x1' }), item({ deviceId: 'kettle' })])] })
    const page = await main()
    await page.findByRole('button', { name: 'Kettle' })
    expect(page.queryByRole('link', { name: /°/ })).not.toBeInTheDocument()
  })
})
