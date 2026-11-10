import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { setToken } from '../auth/session'
import { deviceFixture } from '../test/deviceFixtures'
import { stubWidth } from '../test/stubWidth'
import { createTestClient, liveSubscription, reply } from '../test/testClient'
import { AppShell } from './AppShell'

const kitchen = { id: 'r2', name: 'Kitchen', sortOrder: 0 }
const living = { id: 'r1', name: 'Living room', sortOrder: 1 }

function renderShell(role: 'ADMIN' | 'USER', path = '/') {
  setToken('t')
  const client = createTestClient({
    Me: reply({ me: { __typename: 'User', id: 'u1', name: 'Alice', avatarColor: '#43a047', avatarImage: null, role } }),
    HomeName: reply({ homeName: 'The Cabin' }),
    Devices: reply({ devices: [deviceFixture({ id: 'k1', room: kitchen }), deviceFixture({ id: 'l1', room: living })] }),
    Rooms: reply({ rooms: [living, kitchen].map((r) => ({ __typename: 'Room', ...r })) }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>dashboard page</div>} />
            <Route path="/routines" element={<div>routines page</div>} />
            <Route path="/rooms/:roomId" element={<div>room page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AppShell on desktop', () => {
  beforeEach(() => stubWidth(true))

  it('shows the home name, the main links and the user, and marks the current page', async () => {
    renderShell('USER')
    expect(await screen.findByText('The Cabin')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Cameras' })).toHaveAttribute('href', '/cameras')
    expect(within(nav).getByRole('link', { name: 'Routines' })).toHaveAttribute('href', '/routines')
    expect(within(nav).queryByRole('link', { name: 'Devices' })).not.toBeInTheDocument()
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('A')).toHaveStyle({ backgroundColor: 'rgb(67, 160, 71)' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit your profile (Alice)' }))
    expect(await screen.findByRole('dialog', { name: 'Your profile' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Alice')
    expect(screen.getByText('dashboard page')).toBeInTheDocument()
  })

  it('lists the rooms under Dashboard and marks the current one', async () => {
    renderShell('USER', '/rooms/r1')
    const rooms = within(await screen.findByRole('list', { name: 'Rooms' }))
    expect(rooms.getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Kitchen', '/rooms/r2'],
      ['Living room', '/rooms/r1'],
    ])
    expect(rooms.getByRole('link', { name: 'Living room' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(screen.queryByRole('list', { name: 'Rooms' })).not.toBeInTheDocument()
  })

  it('lists the admin pages for admins', async () => {
    renderShell('ADMIN')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(await within(nav).findByRole('link', { name: 'Devices' })).toHaveAttribute('href', '/admin/devices')
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin/settings')
    expect(within(nav).getByRole('link', { name: 'Deploys' })).toHaveAttribute('href', '/admin/deploys')
  })

  it('collapses to icons and remembers it', async () => {
    renderShell('USER')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeInTheDocument()
    expect(screen.queryByText('Routines')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Routines' })).toBeInTheDocument()
    expect(localStorage.getItem('home.navCollapsed')).toBe('1')
  })
})

describe('AppShell on a phone', () => {
  beforeEach(() => stubWidth(false))

  it('hides the menu behind a button and closes it after navigating', async () => {
    renderShell('USER')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByRole('list', { name: 'Rooms' })).not.toBeInTheDocument() // the room grid is the phone's way in
    fireEvent.click(within(nav).getByRole('link', { name: 'Routines' }))
    expect(await screen.findByText('routines page')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false'))
  })
})
