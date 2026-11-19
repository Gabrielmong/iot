import { ApolloProvider } from '@apollo/client/react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { setToken } from '../auth/session'
import type { DeviceFieldsFragment } from '../gql/graphql'
import { deviceFixture } from '../test/deviceFixtures'
import { routineHandlers } from '../test/routineFixtures'
import { stubWidth } from '../test/stubWidth'
import { createTestClient, liveSubscription, reply } from '../test/testClient'
import { DashboardPage } from './DashboardPage'

const living = { id: 'r1', name: 'Living room', sortOrder: 1 }
const kitchen = { id: 'r2', name: 'Kitchen', sortOrder: 0 }
const devices: DeviceFieldsFragment[] = [
  deviceFixture({ id: 'kettle', name: 'Kettle', kind: 'PLUG', on: true, room: kitchen }),
  deviceFixture({ id: 'toaster', name: 'Toaster', kind: 'PLUG', on: false, room: kitchen }),
  deviceFixture({ id: 'tv-plug', name: 'TV plug', kind: 'PLUG', on: false, room: living }),
]

function renderAt(path: string) {
  setToken('t')
  const client = createTestClient({
    Me: reply({ me: { __typename: 'User', id: 'u1', name: 'Alice', avatarColor: '#43a047', avatarImage: null, role: 'USER', hasPin: true } }),
    Devices: reply({ devices }),
    Rooms: reply({ rooms: [living, kitchen].map((r) => ({ __typename: 'Room', ...r })) }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
    DashboardLayouts: reply({ dashboardLayouts: [] }),
    ...routineHandlers(),
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/rooms/:roomId" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('DashboardPage on a phone', () => {
  beforeEach(() => stubWidth(false))

  it("shows only the room's devices under its name, with a way back to the rooms", async () => {
    renderAt('/rooms/r2')
    expect(await screen.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Kettle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'TV plug' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to rooms' })).toHaveAttribute('href', '/rooms')
  })
})

describe('DashboardPage on a computer', () => {
  beforeEach(() => stubWidth(true))

  it('shows the room with no way back to a room grid (the rooms are in the side menu)', async () => {
    renderAt('/rooms/r1')
    expect(await screen.findByRole('heading', { name: 'Living room' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'TV plug' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to rooms' })).not.toBeInTheDocument()
  })
})
